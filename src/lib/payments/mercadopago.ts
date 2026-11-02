import 'server-only'
import { MercadoPagoConfig as SdkConfig, MercadoPagoError, Order } from 'mercadopago'
import { z } from 'zod'
import { isMercadoPagoUrl } from '@/lib/payments/order'

/**
 * Conversa com a API do Mercado Pago (só servidor): Checkout Transparente pela API de Orders.
 *
 * Usa o SDK oficial do Mercado Pago para servidor (pacote `mercadopago`, sem dependências próprias) para criar e consultar
 * ordens. Ele identifica a integração nos cabeçalhos e é o que o Mercado Pago mede na "Qualidade da integração". As
 * tentativas automáticas do SDK ficam DESLIGADAS (maxRetries: 0): quem decide o que fazer com uma falha incerta é o
 * checkout (a chave de idempotência garante que repetir nunca cobra duas vezes). O SDK joga fora o corpo das respostas
 * de erro, e é nele que vem o motivo da recusa do cartão (402); por isso, num erro 4xx, o corpo é lido de novo com a
 * MESMA chave de idempotência (o Mercado Pago devolve a resposta guardada; nada é processado de novo).
 * O token de acesso fica só em variável de ambiente do servidor, nunca em NEXT_PUBLIC_, nunca em log e nunca em mensagem de erro.
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

/** Item do pedido, como está no banco (um curso, uma unidade). */
export type OrderItemInput = { courseId: string; title: string; priceCents: number }

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
  /** Cursos do pedido, do banco (nunca do navegador). */
  items: OrderItemInput[]
  /** Nome da conta (como a pessoa cadastrou), para o antifraude. Opcional. */
  payerName?: string | null
  /** Quando a conta foi criada (data de cadastro), para o antifraude. Opcional. */
  payerSince?: string | null
  /** Identificador do dispositivo (antifraude), opcional. */
  deviceId?: string
  payment: { kind: 'card'; token: string; paymentMethodId: string; installments: number } | { kind: 'pix' }
}

/** Categoria dos itens no Mercado Pago ("learnings" = educação/cursos). */
export const ITEM_CATEGORY = 'learnings'
/** Nome que aparece na fatura do cartão (até 13 caracteres). */
export const STATEMENT_DESCRIPTOR = 'FOLYO'

/** "Ana Maria Souza" → { firstName: 'Ana', lastName: 'Maria Souza' }. Só letras, espaço, apóstrofo, ponto e hífen. */
export function splitName(raw: string | null | undefined): { firstName?: string; lastName?: string } {
  const clean = (raw ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\s'.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!clean) return {}
  const [first, ...rest] = clean.split(' ')
  return { firstName: first.slice(0, 60), ...(rest.length ? { lastName: rest.join(' ').slice(0, 60) } : {}) }
}

/**
 * Preço de cada item para o Mercado Pago, de modo que a soma dos itens seja SEMPRE igual ao total cobrado. Sem desconto,
 * é o preço de tabela. Com cupom, o desconto é repartido em proporção ao preço (os centavos que sobram vão para os
 * maiores restos), para a ordem nunca ter itens somando mais do que o total.
 */
export function allocateItems(items: OrderItemInput[], totalCents: number): { title: string; cents: number }[] | null {
  const sum = items.reduce((acc, item) => acc + item.priceCents, 0)
  if (items.length === 0 || sum <= 0 || totalCents <= 0) return null
  if (sum === totalCents) return items.map((item) => ({ title: item.title, cents: item.priceCents }))
  const total = BigInt(totalCents)
  const base = BigInt(sum)
  const shares = items.map((item, index) => {
    const product = BigInt(item.priceCents) * total
    return { index, cents: Number(product / base), rest: product % base }
  })
  let left = totalCents - shares.reduce((acc, share) => acc + share.cents, 0)
  for (const share of [...shares].sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1))) {
    if (left <= 0) break
    share.cents += 1
    left -= 1
  }
  if (shares.some((share) => share.cents < 1)) return null
  return items.map((item, index) => ({ title: item.title, cents: shares[index].cents }))
}

/** Corpo do POST /v1/orders. Separado para os testes conferirem o que vai para o Mercado Pago. */
export function buildOrderBody(input: NewGatewayOrder): Record<string, unknown> {
  const amount = fromCents(input.totalCents)
  const { firstName, lastName } = splitName(input.payerName)
  const payer = {
    email: input.email,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    identification: { type: 'CPF', number: input.cpf },
  }
  // Itens: sempre somando o total (veja allocateItems). Sem itens utilizáveis, um item só com a descrição do pedido.
  const priced = allocateItems(input.items, input.totalCents) ?? [{ title: input.description, cents: input.totalCents }]
  const items = priced.map((item) => ({
    title: item.title.trim().slice(0, 150) || 'Curso Folyo',
    unit_price: fromCents(item.cents),
    quantity: 1,
    category_id: ITEM_CATEGORY,
  }))
  const since = input.payerSince ? new Date(input.payerSince) : null
  const common = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: amount,
    external_reference: input.orderId,
    description: input.description,
    payer,
    items,
    ...(since && !Number.isNaN(since.getTime()) ? { additional_info: { payer: { registration_date: since.toISOString() } } } : {}),
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
      payment_method: { max_installments: 12 },
      // 3D Secure quando o antifraude do Mercado Pago achar risco; sem a troca de responsabilidade, o banco assume a fraude.
      online: { transaction_security: THREE_DS },
    },
    transactions: {
      payments: [
        {
          amount,
          payment_method: {
            id: input.payment.paymentMethodId,
            type: 'credit_card',
            token: input.payment.token,
            installments: input.payment.installments,
            statement_descriptor: STATEMENT_DESCRIPTOR,
          },
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

/** Um erro 4xx em que vale ler o corpo (recusa do cartão, dados inválidos). 408/409/423/429 são "tente depois": sem leitura. */
const isClientRejection = (status: number) => status >= 400 && status < 500 && ![408, 409, 423, 429].includes(status)

function sdkConfig(cfg: MercadoPagoConfig, timeout: number) {
  return new SdkConfig({ accessToken: cfg.accessToken, options: { timeout, maxRetries: 0 } })
}

/** Falha do SDK → GatewayError só com o status (nada de corpo, token ou mensagem original). */
function gatewayFailure(error: unknown, message: string): GatewayError {
  if (error instanceof MercadoPagoError && error.status > 0) return new GatewayError(message, error.status)
  return new GatewayError('Mercado Pago inacessível')
}

/**
 * Cria a ordem de pagamento (cartão ou Pix) a partir do VALOR DO PEDIDO NO BANCO.
 *
 * Mesmo quando o Mercado Pago responde com erro HTTP, se o corpo for uma ordem (ex.: pagamento recusado) ela é devolvida
 * normalmente. Erro sem ordem vira GatewayError (com status e código, nada mais).
 */
export async function createGatewayOrder(cfg: MercadoPagoConfig, input: NewGatewayOrder): Promise<GatewayOrder> {
  const body = buildOrderBody(input)
  const timeoutMs = 25_000
  let ok = true
  let status = 201
  let raw: unknown
  try {
    raw = await new Order(sdkConfig(cfg, timeoutMs)).create({
      body: body as unknown as Parameters<Order['create']>[0]['body'],
      requestOptions: { idempotencyKey: input.attemptId, ...(input.deviceId ? { meliSessionId: input.deviceId } : {}) },
    })
  } catch (error) {
    const failure = gatewayFailure(error, 'Mercado Pago recusou a criação do pagamento')
    if (failure.status === undefined || !isClientRejection(failure.status)) throw failure
    // O SDK não guarda o corpo do erro. Lê de novo com a mesma chave de idempotência (a resposta guardada volta igual).
    try {
      const response = await call(cfg, '/v1/orders', {
        method: 'POST',
        body,
        timeoutMs,
        headers: {
          'X-Idempotency-Key': input.attemptId,
          ...(input.deviceId ? { 'X-meli-session-id': input.deviceId } : {}),
        },
      })
      ok = response.ok
      status = response.status
      raw = await response.json().catch(() => null)
    } catch {
      throw failure
    }
  }
  // Pagamento recusado volta como erro HTTP (402), com a ordem em `data` e o motivo em errors[].details.
  const order = parseGatewayOrder(raw) ?? parseGatewayOrder(dataOf(raw))
  if (order && (ok || order.externalReference === input.orderId)) {
    const reason = declineReason(raw)
    if (reason && order.payment && !order.payment.statusDetail) order.payment.statusDetail = reason
    return order
  }
  if (!ok) throw new GatewayError('Mercado Pago recusou a criação do pagamento', status, errorCode(raw))
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
  let raw: unknown
  try {
    raw = await new Order(sdkConfig(cfg, 10_000)).get({ id: providerOrderId })
  } catch (error) {
    // 404 = não existe; 400 = id que o Mercado Pago nem reconhece (a notificação de teste do painel usa um id inventado).
    if (error instanceof MercadoPagoError && (error.status === 404 || error.status === 400)) return { kind: 'not_found' }
    throw gatewayFailure(error, 'Mercado Pago recusou a consulta')
  }
  const order = parseGatewayOrder(raw)
  if (!order || order.id !== providerOrderId) throw new GatewayError('Resposta inesperada do Mercado Pago')
  return { kind: 'ok', order }
}
