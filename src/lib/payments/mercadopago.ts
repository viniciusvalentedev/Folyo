import 'server-only'
import { z } from 'zod'
import { isMercadoPagoUrl } from '@/lib/payments/order'
import { SITE_URL } from '@/lib/seo'

/**
 * Conversa com a API do Mercado Pago (só servidor).
 *
 * Usa o fetch direto, sem o SDK: são só duas chamadas (criar a preferência de pagamento e consultar um pagamento),
 * e assim não entra nenhuma dependência nova no projeto. O token de acesso fica só em variável de ambiente do
 * servidor, nunca em NEXT_PUBLIC_, nunca em log e nunca em mensagem de erro.
 *
 * Variáveis (veja o .env.example):
 *  - MERCADOPAGO_ACCESS_TOKEN: token da aplicação (teste ou produção; na Vercel, teste em Preview e produção só em Production).
 *  - MERCADOPAGO_WEBHOOK_SECRET: chave secreta do webhook (Suas integrações → Webhooks).
 *  - PAYMENTS_ENABLED=true: liga a venda (o botão de pagar). Desligado, os webhooks de pedidos já criados continuam
 *    sendo processados (o dinheiro que entrou não pode ficar sem curso).
 *  - MERCADOPAGO_USE_SANDBOX_URL=true: usa o link de teste (sandbox_init_point) em vez do link normal.
 */

const API = 'https://api.mercadopago.com'
const TIMEOUT_MS = 10_000

export type MercadoPagoConfig = { accessToken: string; webhookSecret: string; useSandboxUrl: boolean; siteUrl: string }

function readConfig(): MercadoPagoConfig | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
  if (!accessToken || !webhookSecret) return null
  return { accessToken, webhookSecret, useSandboxUrl: process.env.MERCADOPAGO_USE_SANDBOX_URL === 'true', siteUrl: SITE_URL }
}

/** Venda ligada? (PAYMENTS_ENABLED=true E as duas chaves preenchidas.) */
export function checkoutConfig(): MercadoPagoConfig | null {
  return process.env.PAYMENTS_ENABLED === 'true' ? readConfig() : null
}

/** Webhook: processa mesmo com a venda desligada (só precisa das chaves). */
export function webhookConfig(): MercadoPagoConfig | null {
  return readConfig()
}

/** Falha ao falar com o Mercado Pago. Só carrega o status HTTP: nunca o token nem o corpo da resposta. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

async function call(cfg: MercadoPagoConfig, path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<Response> {
  try {
    return await fetch(API + path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    // Rede, tempo esgotado ou redirecionamento inesperado. A mensagem original pode ter detalhes demais.
    throw new GatewayError('Mercado Pago inacessível')
  }
}

// ---------- Criar o link de pagamento (Checkout Pro) ----------

export type OrderForPreference = { orderId: string; items: { courseId: string; title: string; priceCents: number }[] }

const preferenceSchema = z.object({
  id: z.string().regex(/^[0-9A-Za-z_-]{1,100}$/),
  init_point: z.string().optional(),
  sandbox_init_point: z.string().optional(),
})

/** Prazo do link: igual ao do pedido no banco (2 dias). O Mercado Pago pede o fuso no texto; Brasília é -03:00 o ano todo. */
function brasiliaIso(date: Date) {
  return new Date(date.getTime() - 3 * 3_600_000).toISOString().replace('Z', '-03:00')
}

/**
 * Cria a "preferência" do Checkout Pro a partir da FOTO do pedido que o banco gravou (títulos e preços do banco,
 * nunca do navegador). O aluno é mandado para a página do Mercado Pago, onde escolhe cartão, Pix, etc. (com ou sem
 * conta lá). Não enviamos dados pessoais do aluno: o Mercado Pago pede o que precisa na página dele.
 */
export async function createPreference(cfg: MercadoPagoConfig, order: OrderForPreference, now = new Date()): Promise<{ preferenceId: string; checkoutUrl: string }> {
  const back = `${cfg.siteUrl}/finalizar/retorno?pedido=${order.orderId}`
  const response = await call(cfg, '/checkout/preferences', {
    method: 'POST',
    body: {
      items: order.items.map((i) => ({
        id: i.courseId,
        title: i.title.slice(0, 120),
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number((i.priceCents / 100).toFixed(2)),
      })),
      external_reference: order.orderId,
      notification_url: `${cfg.siteUrl}/api/webhooks/mercadopago`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      statement_descriptor: 'FOLYO',
      expires: true,
      expiration_date_from: brasiliaIso(now),
      expiration_date_to: brasiliaIso(new Date(now.getTime() + 2 * 86_400_000)),
    },
  })
  if (!response.ok) throw new GatewayError('Mercado Pago recusou a criação do pagamento', response.status)
  const parsed = preferenceSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new GatewayError('Resposta inesperada do Mercado Pago')
  const url = cfg.useSandboxUrl ? parsed.data.sandbox_init_point : parsed.data.init_point
  if (!isMercadoPagoUrl(url)) throw new GatewayError('Endereço de pagamento inesperado')
  return { preferenceId: parsed.data.id, checkoutUrl: url }
}

// ---------- Consultar um pagamento ----------

const paymentSchema = z.object({
  id: z.union([z.number(), z.string()]),
  status: z.string().regex(/^[a-z_]{1,40}$/),
  transaction_amount: z.number(),
  currency_id: z.string().max(8),
  external_reference: z.string().max(100).nullish(),
})

export type GatewayPayment = { id: string; status: string; amountCents: number; currency: string; externalReference: string | null }
export type PaymentLookup = { kind: 'ok'; payment: GatewayPayment } | { kind: 'not_found' }

/**
 * Consulta o pagamento direto na API (com o NOSSO token). É dela, e não do corpo da notificação, que vêm status,
 * valor e pedido. Um pagamento de outra conta não aparece aqui. 404 = não existe (ex.: notificação de teste);
 * qualquer outra falha lança GatewayError (o webhook responde erro e o Mercado Pago tenta de novo).
 */
export async function fetchPayment(cfg: MercadoPagoConfig, paymentId: string): Promise<PaymentLookup> {
  if (!/^\d{1,20}$/.test(paymentId)) throw new GatewayError('Id de pagamento inválido')
  const response = await call(cfg, `/v1/payments/${paymentId}`, { method: 'GET' })
  if (response.status === 404) return { kind: 'not_found' }
  if (!response.ok) throw new GatewayError('Mercado Pago recusou a consulta', response.status)
  const parsed = paymentSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success || String(parsed.data.id) !== paymentId) throw new GatewayError('Resposta inesperada do Mercado Pago')
  const amountCents = Math.round(parsed.data.transaction_amount * 100)
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) throw new GatewayError('Valor inesperado do Mercado Pago')
  return {
    kind: 'ok',
    payment: {
      id: String(parsed.data.id),
      status: parsed.data.status,
      amountCents,
      currency: parsed.data.currency_id,
      externalReference: parsed.data.external_reference ?? null,
    },
  }
}
