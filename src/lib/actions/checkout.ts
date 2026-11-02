'use server'

import { after } from 'next/server'
import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { CART_MAX } from '@/lib/cart'
import { sendOrderReceipt } from '@/lib/email/send'
import { checkoutConfig, createGatewayOrder, GatewayError, PIX_MINUTES, webhookConfig, type GatewayOrder } from '@/lib/payments/mercadopago'
import {
  CHECKOUT_FAILED,
  CHECKOUT_UNAVAILABLE,
  declineMessage,
  GATEWAY_UNSURE,
  hostOf,
  INVALID_FORM,
  isThreeDsUrl,
  orderIdSchema,
  orderSchema,
  orderStatusSchema,
  payInputSchema,
  pixSchema,
  SAFE_ORDER_ERRORS,
  type OrderStatusResult,
  type PayResult,
  type StartResult,
} from '@/lib/payments/order'
import { applyGatewayOrder, reconcileGatewayOrder } from '@/lib/payments/reconcile'
import { mapGatewayStatus } from '@/lib/payments/status'
import { CART_LIMITS, allow } from '@/lib/security/rate-limit'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { actionContext, type ActionContext } from './shared'

/**
 * Pagamento dentro do site (rodam SÓ no servidor).
 *
 * O navegador manda ids de cursos (para criar o pedido) e, para pagar, o id do pedido, o CPF e o TOKEN do cartão, que o
 * MercadoPago.js gerou nos campos seguros do Mercado Pago: número, validade e código do cartão nunca chegam aqui.
 * Preço, total e itens vêm SEMPRE do banco (create_order e begin_payment_attempt, com a conta de quem está logado).
 * Antes de falar com o Mercado Pago o banco confere dono, prazo, limites de tentativas e pagamento em andamento.
 * Aqui não se libera acesso a curso nenhum: isso é trabalho de applyGatewayOrder, depois de ler a ordem na API.
 */

const EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.'
const TOO_MANY = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
const STATUS_FAILED = 'Não foi possível conferir o pedido agora.'
const THREE_DS_FAILED = 'Não foi possível abrir a confirmação do banco. Nada foi cobrado. Tente de novo em alguns minutos.'

/** Por quanto tempo cada estado em aberto impede um novo pagamento do mesmo pedido (o banco aplica). */
const OPEN_MINUTES = { processando: 30, aguardando_acao: 15, aguardando_pix: PIX_MINUTES } as const

const startInput = z.object({ courseIds: z.array(z.string().regex(ID_PATTERN)).min(1).max(CART_MAX) })

/** Cria (ou reaproveita) o pedido do carrinho. O pagamento acontece na página do pedido, dentro do site. */
export async function startCheckoutAction(input: unknown): Promise<StartResult> {
  const parsed = startInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: CHECKOUT_FAILED }
  if (!checkoutConfig()) return { ok: false, error: CHECKOUT_UNAVAILABLE }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('checkout:' + ctx.user.id, CART_LIMITS.checkout)) return { ok: false, error: TOO_MANY }

  const created = await ctx.supabase.rpc('create_order', { p_course_ids: parsed.data.courseIds })
  if (created.error) {
    const e = created.error
    if (e.code === 'FY429') return { ok: false, error: TOO_MANY }
    // FC422 = o banco escreveu a mensagem para a tela (ex.: nenhum curso à venda).
    if (e.code === 'FC422' && e.message && SAFE_ORDER_ERRORS.includes(e.message)) return { ok: false, error: e.message }
    console.error('Falha ao criar o pedido', { code: e.code })
    return { ok: false, error: CHECKOUT_FAILED }
  }
  const order = orderSchema.safeParse(created.data)
  if (!order.success) {
    console.error('Resposta inesperada ao criar o pedido')
    return { ok: false, error: CHECKOUT_FAILED }
  }
  return { ok: true, orderId: order.data.orderId }
}

const beginSchema = z.object({
  reused: z.boolean(),
  attemptId: z.uuid(),
  orderId: z.uuid(),
  totalCents: z.number().int().min(1).max(100_000_000),
  email: z.email().max(254).nullish(),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int().min(1) })).optional(),
  pix: pixSchema.optional(),
})

/** Códigos de erro do Mercado Pago que são "dados do cartão errados" (nada foi processado, nada foi cobrado). */
const CARD_DATA_ERRORS = new Set(['bad_filled_card_data', 'invalid_card_token', 'invalid_installments'])

type Service = ReturnType<typeof createSupabaseServiceClient>

/** Deixa o recibo para depois da resposta (o e-mail é cortesia e não pode atrasar a tela). */
function sendReceiptLater(supabase: Service, orderId: string) {
  try {
    after(async () => {
      await sendOrderReceipt(supabase, orderId)
    })
  } catch {
    // Fora de uma requisição o `after` não existe; o webhook manda o recibo de qualquer jeito.
  }
}

/**
 * Paga o pedido com cartão (token + parcelas) ou Pix. Devolve o estado: aprovado/processando (a tela espera o pedido
 * virar "pago"), confirmação do banco (3D Secure) em iframe, Pix para pagar, ou o motivo da recusa.
 */
export async function payOrderAction(input: unknown): Promise<PayResult> {
  const parsed = payInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID_FORM }
  const pay = parsed.data
  const cfg = checkoutConfig()
  if (!cfg) return { ok: false, error: CHECKOUT_UNAVAILABLE }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('pay:' + ctx.user.id, CART_LIMITS.pay)) return { ok: false, error: TOO_MANY }

  // 1. O banco confere o pedido (dono, prazo, limites, pagamento em andamento) e devolve valor e itens.
  const begun = await ctx.supabase.rpc('begin_payment_attempt', {
    p_order: pay.orderId,
    p_method: pay.method,
    p_installments: pay.method === 'cartao' ? pay.installments : 1,
  })
  if (begun.error) {
    const e = begun.error
    if (e.code === 'FY429') return { ok: false, error: TOO_MANY }
    if (e.code === 'FC422' && e.message && SAFE_ORDER_ERRORS.includes(e.message)) return { ok: false, error: e.message }
    console.error('Falha ao iniciar a tentativa de pagamento', { code: e.code })
    return { ok: false, error: CHECKOUT_FAILED }
  }
  const attempt = beginSchema.safeParse(begun.data)
  if (!attempt.success || attempt.data.orderId !== pay.orderId) {
    console.error('Resposta inesperada ao iniciar a tentativa de pagamento')
    return { ok: false, error: CHECKOUT_FAILED }
  }
  const started = attempt.data

  // Pix já gerado e ainda válido: mostra o mesmo (nada de criar outro).
  if (started.reused) {
    return started.pix ? { ok: true, state: 'aguardando_pix', pix: started.pix } : { ok: false, error: CHECKOUT_FAILED }
  }
  if (!started.email || !started.items?.length) {
    console.error('Tentativa de pagamento sem e-mail ou itens')
    return { ok: false, error: CHECKOUT_FAILED }
  }

  let supabase: Service
  try {
    supabase = createSupabaseServiceClient()
  } catch {
    console.error('Pagamento sem a chave secreta do Supabase')
    return { ok: false, error: CHECKOUT_UNAVAILABLE }
  }

  const record = async (
    status: string,
    detail: string | null,
    gateway: GatewayOrder | null,
    minutes: number,
    pix?: { code: string; qrBase64: string | null; ticketUrl: string | null; expiresAt: string },
  ) => {
    const r = await supabase.rpc('record_payment_attempt', {
      p_attempt: started.attemptId,
      p_status: status,
      p_status_detail: detail,
      p_provider_order_id: gateway?.id ?? null,
      p_provider_payment_id: gateway?.payment?.id ?? null,
      p_open_minutes: minutes,
      p_pix_code: pix?.code ?? null,
      p_pix_qr_base64: pix?.qrBase64 ?? null,
      p_pix_ticket_url: pix?.ticketUrl ?? null,
      p_pix_expires_at: pix?.expiresAt ?? null,
    })
    // Sem gravar, a tentativa fica "criando" e libera sozinha em 2 minutos; o webhook cuida do resto.
    if (r.error) console.error('Falha ao gravar a tentativa de pagamento', { code: r.error.code })
  }

  // 2. Cria o pagamento no Mercado Pago com o VALOR DO PEDIDO NO BANCO.
  let gateway: GatewayOrder
  try {
    gateway = await createGatewayOrder(cfg, {
      orderId: started.orderId,
      attemptId: started.attemptId,
      totalCents: started.totalCents,
      email: started.email,
      cpf: pay.cpf,
      description: `Folyo: ${started.items.length} ${started.items.length === 1 ? 'curso' : 'cursos'}`,
      deviceId: pay.deviceId,
      payment: pay.method === 'pix' ? { kind: 'pix' } : { kind: 'card', token: pay.token, paymentMethodId: pay.paymentMethodId, installments: pay.installments },
    })
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : undefined
    const code = error instanceof GatewayError ? error.code : undefined
    console.error('Falha ao criar o pagamento no Mercado Pago', { status, code })
    // Recusa clara (4xx): nada foi processado. Qualquer outra falha (rede, tempo esgotado, 5xx) é incerta: o pagamento
    // pode ter sido criado, então segura um novo pagamento por alguns minutos para o aviso do Mercado Pago chegar.
    if (status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429) {
      await record('erro', code && /^[0-9A-Za-z_]{1,80}$/.test(code) ? code : null, null, 1)
      return { ok: false, error: code && CARD_DATA_ERRORS.has(code) ? declineMessage(code) : CHECKOUT_FAILED }
    }
    await record('processando', null, null, 3)
    return { ok: false, error: GATEWAY_UNSURE }
  }

  // 3. Grava o que o Mercado Pago respondeu.
  const decision = mapGatewayStatus(gateway.status, gateway.statusDetail)
  const state = decision.state && decision.state !== 'reembolsado' ? decision.state : 'processando'
  // O motivo da recusa vem no pagamento (ex.: rejected_by_issuer); o da ordem pode ser só "failed".
  const detail = gateway.payment?.statusDetail ?? gateway.statusDetail ?? null
  const payment = gateway.payment

  if (state === 'aguardando_pix') {
    const pix = payment?.pix
    if (!pix) {
      await record('erro', 'pix_sem_codigo', gateway, 1)
      return { ok: false, error: CHECKOUT_FAILED }
    }
    const expires = payment?.expiresAt && !Number.isNaN(Date.parse(payment.expiresAt)) ? new Date(payment.expiresAt) : new Date(Date.now() + PIX_MINUTES * 60_000)
    const info = { ...pix, expiresAt: expires.toISOString() }
    await record(state, detail, gateway, Math.max(1, Math.min(PIX_MINUTES, Math.ceil((expires.getTime() - Date.now()) / 60_000))), info)
    return { ok: true, state, pix: info }
  }

  const open = state === 'processando' || state === 'aguardando_acao'
  await record(state, detail, gateway, open ? OPEN_MINUTES[state] : 1)

  switch (state) {
    case 'aprovado': {
      // Aplica já (a tela não precisa esperar o aviso do Mercado Pago). Se algo falhar aqui, o webhook aplica.
      try {
        const outcome = await applyGatewayOrder(supabase, gateway)
        if (outcome.kind === 'ok' && outcome.receiptDue) sendReceiptLater(supabase, outcome.orderId)
      } catch {
        console.error('Falha ao aplicar o pagamento aprovado; o aviso do Mercado Pago aplica depois')
      }
      return { ok: true, state: 'aprovado' }
    }
    case 'aguardando_acao': {
      const url = payment?.threeDsUrl
      if (isThreeDsUrl(url)) return { ok: true, state, threeDsUrl: url }
      // O endereço da confirmação do banco precisa ser do Mercado Pago (a CSP da página também só libera esses).
      console.error('Confirmação do banco sem endereço utilizável', { host: url ? hostOf(url) : 'ausente' })
      return { ok: false, error: THREE_DS_FAILED }
    }
    case 'processando':
      return { ok: true, state }
    case 'recusado':
      // Recusa é um resultado normal, mas o motivo ajuda a entender testes e fraudes (só códigos, nada de dado pessoal).
      console.warn('Pagamento recusado', { orderId: started.orderId, method: pay.method, status: gateway.status, detail })
      return { ok: false, error: declineMessage(detail) }
    default:
      return { ok: false, error: CHECKOUT_FAILED }
  }
}

/** Status do PRÓPRIO pedido (só lê o banco; a tela pergunta a cada poucos segundos até o pedido ficar pago). */
export async function orderStatusAction(orderId: unknown): Promise<OrderStatusResult> {
  const id = orderIdSchema.safeParse(orderId)
  if (!id.success) return { ok: false, error: STATUS_FAILED }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('orderstatus:' + ctx.user.id, CART_LIMITS.orderStatus)) return { ok: false, error: TOO_MANY }
  return readOrderStatus(ctx.supabase, id.data)
}

async function readOrderStatus(supabase: ActionContext['supabase'], orderId: string): Promise<OrderStatusResult> {
  const { data, error } = await supabase.rpc('order_status', { p_order: orderId })
  if (error) {
    console.error('Falha ao ler o pedido', { code: error.code })
    return { ok: false, error: STATUS_FAILED }
  }
  const order = orderStatusSchema.safeParse(data)
  if (!order.success) return { ok: false, error: STATUS_FAILED }
  return { ok: true, order: order.data }
}

/**
 * "Conferir pagamento": consulta o Mercado Pago sobre o pagamento em andamento DESTE pedido (do aluno logado) e aplica o
 * resultado. É a rede de segurança do aviso (webhook) e o que fecha o 3D Secure na hora. Só consulta a API se o pedido
 * estiver em aberto com um pagamento em andamento.
 */
export async function checkPaymentAction(orderId: unknown): Promise<OrderStatusResult> {
  const id = orderIdSchema.safeParse(orderId)
  if (!id.success) return { ok: false, error: STATUS_FAILED }
  const cfg = webhookConfig()
  if (!cfg) return { ok: false, error: CHECKOUT_UNAVAILABLE }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('paycheck:' + ctx.user.id, CART_LIMITS.payCheck)) return { ok: false, error: TOO_MANY }

  // Só do PRÓPRIO pedido: order_status devolve nulo para pedido de outra pessoa.
  const before = await readOrderStatus(ctx.supabase, id.data)
  if (!before.ok) return before
  const waiting = before.order.status === 'pendente' && before.order.attempt?.open
  if (!waiting) return before

  try {
    const supabase = createSupabaseServiceClient()
    const ref = await supabase.rpc('payment_attempt_ref', { p_order: id.data, p_user: ctx.user.id })
    const providerOrderId = z.object({ providerOrderId: z.string().regex(/^[0-9A-Za-z_-]{1,64}$/) }).safeParse(ref.data)
    if (providerOrderId.success) {
      const outcome = await reconcileGatewayOrder(cfg, supabase, providerOrderId.data.providerOrderId)
      if (outcome.kind === 'ok' && outcome.receiptDue) sendReceiptLater(supabase, outcome.orderId)
    }
  } catch (error) {
    // Mercado Pago fora do ar ou falha nossa: a tela mostra o que o banco já sabe e tenta de novo depois.
    console.error('Falha ao conferir o pagamento', { code: error instanceof Error && 'code' in error ? error.code : undefined })
  }
  return readOrderStatus(ctx.supabase, id.data)
}
