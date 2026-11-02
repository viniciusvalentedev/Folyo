import 'server-only'
import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FALLBACK_SUPPORT_EMAIL } from '@/lib/app-config'
import { buildReceiptEmail, receiptSchema, type ReceiptEmail } from '@/lib/email/receipt'
import { SITE_URL } from '@/lib/seo'

/**
 * Envio de e-mail transacional (só servidor), pelo SMTP da Zoho (o mesmo que o Supabase já usa para os e-mails da conta).
 *
 * Variáveis (veja o .env.example). Use os MESMOS dados que estão em Supabase → Authentication → SMTP:
 *  - SMTP_HOST: servidor SMTP da Zoho (ex.: smtp.zoho.com; depende da região da sua conta).
 *  - SMTP_PORT: 465 (SSL, o padrão) ou 587 (STARTTLS).
 *  - SMTP_USER e SMTP_PASSWORD: o e-mail da conta e a senha (com verificação em duas etapas, use uma "senha de aplicativo").
 *  - EMAIL_FROM: remetente. A Zoho só aceita o endereço da própria conta (ou um alias dela). Ex.: Folyo <contato@usefolyo.com>
 * Nada disso vai para NEXT_PUBLIC_, log ou mensagem de erro.
 *
 * Sem as variáveis, o recibo simplesmente não é enviado (a venda e a liberação do curso não dependem dele).
 */

const TIMEOUT_MS = 10_000
const FROM_PATTERN = /^[^<>\r\n]{1,80}<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$|^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/
const HOST_PATTERN = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i

export type EmailConfig = { host: string; port: number; user: string; password: string; from: string }

/** Configuração do e-mail, ou null se faltar algo (ou se algum dado estiver mal escrito). */
export function emailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST?.trim()
  const user = process.env.SMTP_USER?.trim()
  const password = process.env.SMTP_PASSWORD
  const from = process.env.EMAIL_FROM?.trim()
  const rawPort = process.env.SMTP_PORT?.trim()
  const port = rawPort ? Number(rawPort) : 465
  if (!host || !user || !password || !from) return null
  if (!HOST_PATTERN.test(host) || !Number.isInteger(port) || port < 1 || port > 65535 || !FROM_PATTERN.test(from)) return null
  return { host, port, user, password, from }
}

/** Falha ao enviar. Só leva o código SMTP: nunca a senha, o endereço da pessoa nem o texto da resposta do servidor. */
export class EmailError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'EmailError'
  }
}

export type OutgoingEmail = ReceiptEmail & { to: string; replyTo?: string }

/** Um endereço só: sem espaço, vírgula, ponto e vírgula, aspas nem quebra de linha (o nodemailer entenderia vários destinatários). */
const SINGLE_ADDRESS = /^[^\s,;<>"]+@[^\s,;<>"]+\.[^\s,;<>"]+$/

export async function sendEmail(cfg: EmailConfig, mail: OutgoingEmail): Promise<void> {
  if (!SINGLE_ADDRESS.test(mail.to)) throw new EmailError('Destinatário inválido')
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    // 465 = SSL desde o início; outras portas exigem STARTTLS (nunca manda a senha sem criptografia).
    secure: cfg.port === 465,
    requireTLS: cfg.port !== 465,
    tls: { minVersion: 'TLSv1.2' },
    auth: { user: cfg.user, pass: cfg.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS * 2,
  })
  try {
    await transport.sendMail({
      from: cfg.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    })
  } catch (error) {
    const code = (error as { responseCode?: unknown } | null)?.responseCode
    throw new EmailError('O servidor de e-mail recusou ou não respondeu ao envio', typeof code === 'number' ? code : undefined)
  } finally {
    transport.close()
  }
}

export type ReceiptOutcome = 'enviado' | 'nada_a_enviar' | 'sem_configuracao' | 'falhou'

/**
 * Manda o recibo de um pedido PAGO, no máximo uma vez.
 *
 * O banco reserva o envio (claim_order_receipt: só devolve dados para um pedido pago, sem recibo enviado e sem outro envio
 * em andamento). Se o envio falhar, a reserva é devolvida e o próximo aviso do Mercado Pago tenta de novo.
 * Nunca lança erro: o recibo é cortesia e não pode derrubar a confirmação do pagamento.
 */
export async function sendOrderReceipt(supabase: Pick<SupabaseClient, 'rpc'>, orderId: string): Promise<ReceiptOutcome> {
  const cfg = emailConfig()
  if (!cfg) {
    console.warn('Recibo não enviado: e-mail sem configuração (SMTP_HOST, SMTP_USER, SMTP_PASSWORD e EMAIL_FROM)')
    return 'sem_configuracao'
  }

  const claimed = await supabase.rpc('claim_order_receipt', { p_order: orderId })
  if (claimed.error) {
    // PGRST202 = o SQL de recibo ainda não foi rodado: segue sem recibo.
    if (claimed.error.code !== 'PGRST202') console.error('Falha ao reservar o recibo', { code: claimed.error.code })
    return 'falhou'
  }
  if (claimed.data === null) return 'nada_a_enviar'
  const receipt = receiptSchema.safeParse(claimed.data)
  if (!receipt.success) {
    console.error('Dados do recibo inesperados')
    await release(supabase, orderId, false)
    return 'falhou'
  }

  try {
    await sendEmail(cfg, {
      ...buildReceiptEmail(receipt.data, { siteUrl: SITE_URL, supportEmail: FALLBACK_SUPPORT_EMAIL }),
      to: receipt.data.email,
      replyTo: FALLBACK_SUPPORT_EMAIL,
    })
  } catch (error) {
    console.error('Falha ao enviar o recibo', { status: error instanceof EmailError ? error.status : undefined })
    await release(supabase, orderId, false)
    return 'falhou'
  }
  await release(supabase, orderId, true)
  return 'enviado'
}

async function release(supabase: Pick<SupabaseClient, 'rpc'>, orderId: string, sent: boolean) {
  try {
    const r = await supabase.rpc('finish_order_receipt', { p_order: orderId, p_sent: sent })
    if (r.error) console.error('Falha ao fechar o recibo', { code: r.error.code })
  } catch {
    console.error('Falha ao fechar o recibo')
  }
}
