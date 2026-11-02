import 'server-only'
import { z } from 'zod'
import { isMercadoPagoUrl } from '@/lib/payments/order'

/**
 * Conversa com a API do Mercado Pago (só servidor): Checkout Transparente pela API de Orders.
 *
 * Usa o fetch direto, sem o SDK: são só três chamadas (criar a ordem de pagamento, consultar uma ordem e, mais tarde,
 * cancelar), e assim não entra nenhuma dependência nova. O token de acesso fica só em variável de ambiente do servidor,
 * nunca em NEXT_PUBLIC_, nunca em log e nunca em mensagem de erro.
 *
 * O cartão NUNCA passa por aqui: o navegador troca os dados dele, direto com o Mercado Pago (campos seguros do
 * MercadoPago.js), por um token de uso único. O servidor só recebe esse token.
 *
 * Variáveis (veja o .env.example):
 *  - MERCADOPAGO_ACCESS_TOKEN: token da aplicação (teste ou produção; na Vercel, teste em Preview e produção só em Production).
 *  - MERCADOPAGO_PUBLIC_KEY: chave pública da MESMA aplicação (vai para o navegador; não é segredo, mas precisa ser do mesmo ambiente).
 *  - MERCADOPAGO_WEBHOOK_SECRET: chave secreta do webhook (Suas integrações → Webhooks).
 *  - PAYMENTS_ENABLED=true: liga a venda. Desligado, os avisos de pedidos já criados continuam sendo processados
 *    (o dinheiro que entrou não pode ficar sem curso).
 */

const API = 'https://api.mercadopago.com'
const ID = /^[0-9A-Za-z_-]{1,64}$/
const PUBLIC_KEY = /^(APP_USR|TEST)-[0-9A-Za-z-]{8,100}$/

export type MercadoPagoConfig = { accessToken: string; webhookSecret: string; publicKey: string | null }

function readConfig(): MercadoPagoConfig | null {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
  const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
  if (!accessToken || !webhookSecret) return null
  const key = process.env.MERCADOPAGO_PUBLIC_KEY?.trim()
  return { accessToken, webhookSecret, publicKey: key && PUBLIC_KEY.test(key) ? key : null }
}

/** Venda ligada? (PAYMENTS_ENABLED=true E token, chave pública e chave do webhook preenchidos.) */
export function checkoutConfig(): (MercadoPagoConfig & { publicKey: string }) | null {
  if (process.env.PAYMENTS_ENABLED !== 'true') return null
  const cfg = readConfig()
  return cfg && cfg.publicKey ? { ...cfg, publicKey: cfg.publicKey } : null
}

/** Webhook e conferência de pagamento: funcionam mesmo com a venda desligada (só precisam do token e da chave do webhook). */
export function webhookConfig(): MercadoPagoConfig | null {
  return readConfig()
}

/** Falha ao falar com o Mercado Pago. Só carrega o status HTTP e um código: nunca o token nem o corpo da resposta. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

async function call(
  cfg: MercadoPagoConfig,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; headers?: Record<string, string>; timeoutMs?: number },
): Promise<Response> {
  try {
    return await fetch(API + path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
    })
  } catch {
    // Rede, tempo esgotado ou redirecionamento inesperado. A mensagem original pode ter detalhes demais.
    throw new GatewayError('Mercado Pago inacessível')
  }
}

// ---------- Valores ----------

/** "32.99" → 3299. Só aceita texto ou número com até 2 casas; qualquer outra coisa vira null. */
export function toCents(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : value
  if (typeof text !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

/** 3299 → "32.99" (sem passar por número decimal). */
export function fromCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new GatewayError('Valor inválido')
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

// ---------- Criar a ordem de pagamento ----------

export const PIX_MINUTES = 60
const THREE_DS = { validation: 'on_fraud_risk', liability_shift: 'required' } as const

export type NewGatewayOrder = {
  /** Pedido do Folyo (vai como external_reference: é como o aviso do Mercado Pago volta ao pedido). */
  orderId: string
  /** Id da tentativa no banco: vai como chave de idempotência (repetir a mesma tentativa nunca cobra duas vezes). */
  attemptId: string
  /** SEMPRE o total do pedido no banco, nunca um valor vindo do navegador. */
  totalCents: number
  email: string
  cpf: string
  description: string
  /** Identificador do dispositivo (antifraude), opcional. */
  deviceId?: string
  payment: { kind: 'card'; token: string; paymentMethodId: string; installments: number } | { kind: 'pix' }
}

/** Corpo do POST /v1/orders. Separado para os testes conferirem o que vai para o Mercado Pago. */
export function buildOrderBody(input: NewGatewayOrder): Record<string, unknown> {
  const amount = fromCents(input.totalCents)
  const payer = { email: input.email, identification: { type: 'CPF', number: input.cpf } }
  const common = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: amount,
    external_reference: input.orderId,
    description: input.description,
    payer,
  }
  if (input.payment.kind === 'pix') {
    return {
      ...common,
      transactions: {
        payments: [{ amount, expiration_time: `PT${PIX_MINUTES}M`, payment_method: { id: 'pix', type: 'bank_transfer' } }],
      },
    }
  }
  return {
    ...common,
    config: {
      statement_descriptor: 'FOLYO',
      payment_method: { max_installments: 12 },
      // 3D Secure quando o antifraude do Mercado Pago achar risco; sem a troca de responsabilidade, o banco assume a fraude.
      online: { transaction_security: THREE_DS },
    },
    transactions: {
      payments: [
        {
          amount,
          payment_method: { id: input.payment.paymentMethodId, type: 'credit_card', token: input.payment.token, installments: input.payment.installments },
        },
      ],
    },
  }
}

// ---------- Ler uma ordem ----------

const idText = z.string().regex(ID)
const detailText = z.string().regex(/^[0-9A-Za-z_]{1,80}$/)
const amountField = z.union([z.string(), z.number()])

const paymentSchema = z.object({
  id: idText,
  status: z.string().max(40).nullish(),
  status_detail: detailText.nullish(),
  amount: amountField.nullish(),
  paid_amount: amountField.nullish(),
  refunded_amount: amountField.nullish(),
  date_of_expiration: z.string().max(64).nullish(),
  payment_method: z
    .object({
      qr_code: z.string().max(5000).nullish(),
      qr_code_base64: z.string().max(60_000).nullish(),
      ticket_url: z.string().max(2000).nullish(),
      transaction_security: z.object({ url: z.string().max(2000).nullish(), status: z.string().max(40).nullish() }).nullish(),
    })
    .nullish(),
})

const orderSchema = z.object({
  id: idText,
  status: z.string().max(40),
  status_detail: detailText.nullish(),
  external_reference: z.string().max(100).nullish(),
  total_amount: amountField.nullish(),
  currency: z.string().max(8).nullish(),
  transactions: z.object({ payments: z.array(paymentSchema).max(20).nullish() }).nullish(),
})

export type GatewayPayment = {
  id: string
  status: string | null
  statusDetail: string | null
  amountCents: number | null
  expiresAt: string | null
  pix: { code: string; qrBase64: string | null; ticketUrl: string | null } | null
  /** Endereço da confirmação do banco (3D Secure), para abrir dentro da página. */
  threeDsUrl: string | null
}
export type GatewayOrder = {
  id: string
  status: string
  statusDetail: string | null
  externalReference: string | null
  totalCents: number | null
  currency: string
  paymentCount: number
  /** O primeiro pagamento (criamos sempre um só por ordem). */
  payment: GatewayPayment | null
}

const QR_BASE64 = /^[A-Za-z0-9+/]{20,}={0,2}$/

/** Só passa o que o banco também aceitaria (as mesmas regras da tabela de tentativas); o resto vira null. */
function normalizePayment(p: z.infer<typeof paymentSchema>): GatewayPayment {
  const pm = p.payment_method
  const code = pm?.qr_code
  const pix =
    typeof code === 'string' && code.length >= 20 && code.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(code)
      ? {
          code,
          qrBase64: pm?.qr_code_base64 && pm.qr_code_base64.length <= 30_000 && QR_BASE64.test(pm.qr_code_base64) ? pm.qr_code_base64 : null,
          ticketUrl: isMercadoPagoUrl(pm?.ticket_url) ? pm.ticket_url : null,
        }
      : null
  const url = pm?.transaction_security?.url
  return {
    id: p.id,
    status: p.status ?? null,
    statusDetail: p.status_detail ?? null,
    amountCents: toCents(p.amount),
    expiresAt: p.date_of_expiration ?? null,
    pix,
    threeDsUrl: typeof url === 'string' && url.length <= 2000 && /^https:\/\/[^\s]+$/.test(url) ? url : null,
  }
}

function normalizeOrder(raw: z.infer<typeof orderSchema>): GatewayOrder {
  const payments = raw.transactions?.payments ?? []
  return {
    id: raw.id,
    status: raw.status,
    statusDetail: raw.status_detail ?? null,
    externalReference: raw.external_reference ?? null,
    totalCents: toCents(raw.total_amount),
    // A conta é brasileira: sem moeda na resposta, é real. Qualquer outra moeda segue como veio (e o banco recusa).
    currency: raw.currency ?? 'BRL',
    paymentCount: payments.length,
    payment: payments[0] ? normalizePayment(payments[0]) : null,
  }
}

/** Interpreta o corpo de uma ordem; null se não tiver o formato esperado. */
export function parseGatewayOrder(body: unknown): GatewayOrder | null {
  const parsed = orderSchema.safeParse(body)
  return parsed.success ? normalizeOrder(parsed.data) : null
}

/** Código curto do erro que o Mercado Pago devolve em { errors: [{ code }] } (só o código, nunca o texto). */
function errorCode(body: unknown): string | undefined {
  const parsed = z.object({ errors: z.array(z.object({ code: z.string().regex(/^[A-Za-z0-9_.-]{1,80}$/) })).min(1) }).safeParse(body)
  return parsed.success ? parsed.data.errors[0].code : undefined
}

/** A ordem que o Mercado Pago anexa em `data` nas respostas de erro (ex.: pagamento recusado). */
function dataOf(body: unknown): unknown {
  return typeof body === 'object' && body !== null && 'data' in body ? body.data : null
}

/** Motivo da recusa em errors[0].details (ex.: "PAY01...: rejected_by_issuer"): só o código final, nunca o texto. */
function declineReason(body: unknown): string | undefined {
  const parsed = z.object({ errors: z.array(z.object({ details: z.array(z.string().max(300)).min(1) })).min(1) }).safeParse(body)
  if (!parsed.success) return undefined
  const match = /(?:^|[:\s])([a-z][a-z0-9_]{2,60})$/i.exec(parsed.data.errors[0].details[0].trim())
  return match?.[1].toLowerCase()
}

/**
 * Cria a ordem de pagamento (cartão ou Pix) a partir do VALOR DO PEDIDO NO BANCO.
 *
 * Mesmo quando o Mercado Pago responde com erro HTTP, se o corpo for uma ordem (ex.: pagamento recusado) ela é devolvida
 * normalmente. Erro sem ordem vira GatewayError (com status e código, nada mais).
 */
export async function createGatewayOrder(cfg: MercadoPagoConfig, input: NewGatewayOrder): Promise<GatewayOrder> {
  const response = await call(cfg, '/v1/orders', {
    method: 'POST',
    body: buildOrderBody(input),
    timeoutMs: 25_000,
    headers: {
      'X-Idempotency-Key': input.attemptId,
      ...(input.deviceId ? { 'X-meli-session-id': input.deviceId } : {}),
    },
  })
  const body: unknown = await response.json().catch(() => null)
  // Pagamento recusado volta como erro HTTP (402), com a ordem em `data` e o motivo em errors[].details.
  const order = parseGatewayOrder(body) ?? parseGatewayOrder(dataOf(body))
  if (order && (response.ok || order.externalReference === input.orderId)) {
    const reason = declineReason(body)
    if (reason && order.payment && !order.payment.statusDetail) order.payment.statusDetail = reason
    return order
  }
  if (!response.ok) throw new GatewayError('Mercado Pago recusou a criação do pagamento', response.status, errorCode(body))
  throw new GatewayError('Resposta inesperada do Mercado Pago')
}

export type OrderLookup = { kind: 'ok'; order: GatewayOrder } | { kind: 'not_found' }

/**
 * Consulta a ordem direto na API (com o NOSSO token). É dela, e não do corpo da notificação, que vêm status, valor e pedido.
 * Uma ordem de outra conta não aparece aqui. 404/400 = não existe (ex.: notificação de teste); qualquer outra falha lança
 * GatewayError (o webhook responde erro e o Mercado Pago tenta de novo).
 */
export async function fetchGatewayOrder(cfg: MercadoPagoConfig, providerOrderId: string): Promise<OrderLookup> {
  if (!ID.test(providerOrderId)) throw new GatewayError('Id de ordem inválido')
  const response = await call(cfg, `/v1/orders/${providerOrderId}`, { method: 'GET' })
  // 404 = não existe; 400 = id que o Mercado Pago nem reconhece (a notificação de teste do painel usa um id inventado).
  if (response.status === 404 || response.status === 400) return { kind: 'not_found' }
  if (!response.ok) throw new GatewayError('Mercado Pago recusou a consulta', response.status, undefined)
  const order = parseGatewayOrder(await response.json().catch(() => null))
  if (!order || order.id !== providerOrderId) throw new GatewayError('Resposta inesperada do Mercado Pago')
  return { kind: 'ok', order }
}
