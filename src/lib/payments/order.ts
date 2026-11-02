import { z } from 'zod'

/**
 * Pedido, pagamento e mensagens (navegador e servidor).
 *
 * ATENÇÃO: nada aqui decide preço nem acesso. O pedido é criado pelo banco (create_order) a partir dos ids dos
 * cursos; o valor cobrado é o do pedido no banco (begin_payment_attempt); o acesso só é liberado depois que o servidor
 * consulta o pagamento na API do Mercado Pago (apply_payment). A tela só LÊ o estado do pedido.
 */

export const CHECKOUT_UNAVAILABLE = 'O pagamento online ainda não está disponível.'
export const CHECKOUT_FAILED = 'Não foi possível iniciar o pagamento agora. Nada foi cobrado. Tente de novo em instantes.'
export const NOTHING_FOR_SALE = 'Nenhum curso do carrinho está à venda.'
export const INVALID_FORM = 'Confira os dados do pagamento e tente de novo.'
export const GATEWAY_UNSURE =
  'Não conseguimos confirmar o pagamento agora. Se o valor for cobrado, o curso é liberado automaticamente. Confira em Minhas compras antes de tentar de novo.'

/**
 * Mensagens do banco (erro FC422) que podem ir para a tela; qualquer outra vira a genérica.
 * (tests/payments-messages.test.ts confere esta lista contra as migrations.)
 */
export const SAFE_ORDER_ERRORS: readonly string[] = [
  NOTHING_FOR_SALE,
  'Este pedido já foi pago.',
  'Este pedido não está mais disponível. Volte ao carrinho e tente de novo.',
  'Você já possui um dos cursos deste pedido.',
  'Já existe um pagamento em andamento para este pedido. Aguarde a confirmação.',
  'Você atingiu o limite de tentativas com cartão neste pedido. Tente pagar com Pix ou fale com o suporte.',
  'Muitas tentativas de pagamento em pouco tempo. Aguarde um pouco e tente de novo.',
  'Escolha um parcelamento válido.',
]

export const orderIdSchema = z.uuid()

/** Resposta de create_order. */
export const orderSchema = z.object({
  orderId: orderIdSchema,
  totalCents: z.number().int().min(1).max(100_000_000),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int().min(1) })),
})

export const ORDER_STATUSES = ['pendente', 'pago', 'cancelado', 'expirado', 'reembolsado'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const MAX_INSTALLMENTS = 12

/** Estado de uma tentativa de pagamento (private.payment_attempts.status). */
export const ATTEMPT_STATES = ['criando', 'processando', 'aguardando_acao', 'aguardando_pix', 'aprovado', 'recusado', 'cancelado', 'expirado', 'reembolsado', 'erro'] as const
export type AttemptState = (typeof ATTEMPT_STATES)[number]

/**
 * Só endereços do Mercado Pago (https, mercadopago.com ou mercadopago.com.br e subdomínios).
 * É a mesma regra da tabela de tentativas no banco; conferida de novo antes de mostrar o link ao aluno.
 */
export function isMercadoPagoUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 600 && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.br)?\/[^\s]*$/.test(value)
}

/** Domínios do Mercado Pago de onde a confirmação do banco (3D Secure) pode vir. A CSP da página de pagamento libera os mesmos. */
export const MERCADO_PAGO_DOMAINS = ['mercadopago.com', 'mercadopago.com.br', 'mercadolibre.com', 'mercadolivre.com', 'mercadolivre.com.br', 'mlstatic.com'] as const

/** O servidor de um endereço (sem caminho), em minúsculas, ou null se não for um endereço https válido. */
function httpsHost(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? url.hostname.toLowerCase() : null
  } catch {
    return null
  }
}

/** O servidor está dentro de um dos domínios do Mercado Pago (o próprio domínio ou um subdomínio dele)? */
export function isMercadoPagoHost(host: string | null): boolean {
  return !!host && MERCADO_PAGO_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
}

/** Endereço da confirmação do banco (3D Secure): https e de um domínio do Mercado Pago. */
export function isThreeDsUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 2000 && !/\s/.test(value) && isMercadoPagoHost(httpsHost(value))
}

/** `event.origin` de uma mensagem vinda do iframe da confirmação do banco. */
export function isMercadoPagoOrigin(origin: string): boolean {
  return isMercadoPagoHost(httpsHost(origin))
}

/** Servidor de um endereço, para o log (nunca o endereço inteiro: pode ter token). */
export function hostOf(value: string): string {
  return httpsHost(value) ?? 'invalido'
}

/** Pix em aberto. */
export const pixSchema = z.object({
  code: z.string().min(20).max(1024),
  qrBase64: z.string().max(30_000).nullable(),
  ticketUrl: z.string().max(600).nullable(),
  expiresAt: z.string().max(64).nullable(),
})
export type PixInfo = z.infer<typeof pixSchema>

/** Última tentativa de pagamento do pedido (resposta de order_status). */
export const attemptSchema = z.object({
  method: z.enum(['cartao', 'pix']),
  status: z.enum(ATTEMPT_STATES),
  statusDetail: z.string().max(80).nullable(),
  open: z.boolean(),
  pix: pixSchema.nullable(),
})
export type AttemptInfo = z.infer<typeof attemptSchema>

/** Resposta de order_status (o aluno só vê o próprio pedido). */
export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  totalCents: z.number().int(),
  paidAt: z.string().nullable(),
  expiresAt: z.string().max(64),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int() })),
  attempt: attemptSchema.nullable(),
})
export type OrderStatusInfo = z.infer<typeof orderStatusSchema>

/** Uma compra na lista "Minhas compras" (resposta de my_orders). `payment` só vem em pedido em aberto com pagamento em andamento. */
export const myOrderSchema = z.object({
  id: orderIdSchema,
  status: z.enum(ORDER_STATUSES),
  totalCents: z.number().int(),
  createdAt: z.string().max(64),
  paidAt: z.string().max(64).nullable(),
  refundedAt: z.string().max(64).nullable(),
  payment: z.object({ method: z.enum(['cartao', 'pix']), status: z.enum(ATTEMPT_STATES), until: z.string().max(64) }).nullable(),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int() })),
})
export const myOrdersSchema = z.array(myOrderSchema).max(100)
export type MyOrder = z.infer<typeof myOrderSchema>

/** "3F2B8C1E": o número do pedido que o aluno cita ao falar com o suporte (aparece na tela e no recibo). */
export const orderNumber = (orderId: string) => orderId.slice(0, 8).toUpperCase()

const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' })
/** "2 de novembro de 2026" no horário de Brasília (vazio se a data não for válida). */
export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : DATE.format(d)
}

// ---------- CPF ----------

export const onlyDigits = (value: string) => value.replace(/\D/g, '')

/** CPF com 11 dígitos e dígitos verificadores certos (aceita pontos e traço). */
export function isValidCpf(value: string): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const digit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

/** "12345678909" → "123.456.789-09" (para digitar; aceita CPF incompleto). */
export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// ---------- O que o navegador manda para pagar ----------

const cpfField = z
  .string()
  .max(20)
  .transform(onlyDigits)
  .refine(isValidCpf, 'CPF inválido')
/** Identificador do dispositivo que o MercadoPago.js gera (antifraude). Opcional: sem ele o pagamento segue. */
const deviceField = z.string().regex(/^[A-Za-z0-9_-]{8,200}$/).optional()

const cardInput = z.object({
  method: z.literal('cartao'),
  orderId: orderIdSchema,
  /** Token de uso único do cartão (os dados do cartão nunca passam por aqui). */
  token: z.string().regex(/^[A-Za-z0-9]{16,64}$/),
  paymentMethodId: z.string().regex(/^[a-z0-9_]{2,30}$/),
  installments: z.number().int().min(1).max(MAX_INSTALLMENTS),
  cpf: cpfField,
  deviceId: deviceField,
})
const pixInput = z.object({ method: z.literal('pix'), orderId: orderIdSchema, cpf: cpfField, deviceId: deviceField })
export const payInputSchema = z.discriminatedUnion('method', [cardInput, pixInput])
export type PayInput = z.infer<typeof payInputSchema>

/** Resultado de pagar. A liberação do curso NÃO sai daqui: a tela espera o pedido virar "pago". */
export type PayResult =
  | { ok: true; state: 'aprovado' | 'processando' }
  | { ok: true; state: 'aguardando_acao'; threeDsUrl: string }
  | { ok: true; state: 'aguardando_pix'; pix: PixInfo }
  | { ok: false; error: string }

export type StartResult = { ok: true; orderId: string } | { ok: false; error: string }
export type OrderStatusResult = { ok: true; order: OrderStatusInfo } | { ok: false; error: string }

/** Frases para o aluno a partir do código que o Mercado Pago devolve (nunca mostramos o código cru). */
const DECLINE_MESSAGES: Record<string, string> = {
  bad_filled_card_data: 'Confira os dados do cartão (número, validade e código) e tente de novo.',
  invalid_card_token: 'Os dados do cartão expiraram. Digite-os de novo.',
  high_risk: 'Por segurança, não foi possível aprovar este pagamento. Tente outro cartão ou pague com Pix.',
  rejected_by_issuer: 'O banco do cartão recusou o pagamento. Tente outro cartão ou fale com o seu banco.',
  required_call_for_authorize: 'O banco precisa autorizar este pagamento. Fale com ele ou use outro cartão.',
  max_attempts_exceeded: 'O cartão passou do limite de tentativas. Tente outro cartão ou pague com Pix.',
  card_disabled: 'Este cartão está desabilitado. Ative-o com o banco ou use outro.',
  insufficient_amount: 'Saldo ou limite insuficiente. Tente outro cartão ou pague com Pix.',
  card_insufficient_amount: 'Saldo ou limite insuficiente. Tente outro cartão ou pague com Pix.',
  amount_limit_exceeded: 'O valor passou do limite do cartão. Tente outro cartão ou pague com Pix.',
  invalid_installments: 'Este parcelamento não está disponível para o cartão. Escolha outro número de parcelas.',
  cc_rejected_3ds_challenge: 'A confirmação com o banco não foi concluída. Tente de novo.',
  '3ds_challenge_failed': 'A confirmação com o banco não foi concluída. Nada foi cobrado. Tente de novo ou pague com Pix.',
  '3ds_challenge_expired': 'A confirmação com o banco demorou demais. Tente de novo.',
  processing_error: 'Houve um erro ao processar o pagamento. Nada foi cobrado. Tente de novo em instantes.',
}
const DECLINE_DEFAULT = 'O pagamento não foi aprovado. Nada foi cobrado. Tente outro cartão ou pague com Pix.'

export function declineMessage(detail: string | null | undefined): string {
  return (detail && Object.hasOwn(DECLINE_MESSAGES, detail) && DECLINE_MESSAGES[detail]) || DECLINE_DEFAULT
}
