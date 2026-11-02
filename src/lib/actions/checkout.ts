'use server'

import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { CART_MAX } from '@/lib/cart'
import { checkoutConfig, createPreference } from '@/lib/payments/mercadopago'
import {
  attachSchema,
  CHECKOUT_FAILED,
  CHECKOUT_UNAVAILABLE,
  isMercadoPagoUrl,
  orderIdSchema,
  orderSchema,
  orderStatusSchema,
  SAFE_ORDER_ERRORS,
  type CheckoutResult,
  type OrderStatusResult,
} from '@/lib/payments/order'
import { CART_LIMITS, allow } from '@/lib/security/rate-limit'
import { actionContext } from './shared'

/**
 * Pagamento (rodam SÓ no servidor).
 *
 * O navegador manda apenas ids de cursos. Quem calcula preço e total é o banco (create_order, com a conta de quem está
 * logado) e quem monta o pagamento no Mercado Pago é este arquivo, com a foto do pedido que o banco gravou. Aqui não se
 * libera acesso a curso nenhum: isso é trabalho do webhook, depois de o pagamento ser conferido no Mercado Pago.
 * Nenhum dado de cartão passa por aqui: o aluno paga na página do Mercado Pago.
 */

const EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.'
const TOO_MANY = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
const STATUS_FAILED = 'Não foi possível conferir o pedido agora.'

const checkoutInput = z.object({ courseIds: z.array(z.string().regex(ID_PATTERN)).min(1).max(CART_MAX) })

/** Cria (ou reaproveita) o pedido do carrinho e devolve o link de pagamento do Mercado Pago. */
export async function startCheckoutAction(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: CHECKOUT_FAILED }
  const cfg = checkoutConfig()
  if (!cfg) return { ok: false, error: CHECKOUT_UNAVAILABLE }
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

  // Pedido em aberto que já tem link: o aluno volta para o mesmo pagamento.
  if (order.data.checkoutUrl) {
    if (!isMercadoPagoUrl(order.data.checkoutUrl)) return { ok: false, error: CHECKOUT_FAILED }
    return { ok: true, url: order.data.checkoutUrl, orderId: order.data.orderId }
  }

  let preference
  try {
    preference = await createPreference(cfg, { orderId: order.data.orderId, items: order.data.items })
  } catch (error) {
    console.error('Falha ao criar o pagamento no Mercado Pago', { status: error instanceof Error && 'status' in error ? error.status : undefined })
    return { ok: false, error: CHECKOUT_FAILED }
  }

  // O primeiro link gravado vale (duas abas ao mesmo tempo): o banco devolve o que ficou.
  const attached = await ctx.supabase.rpc('attach_order_checkout', {
    p_order: order.data.orderId,
    p_preference_id: preference.preferenceId,
    p_url: preference.checkoutUrl,
  })
  const url = attachSchema.safeParse(attached.data)
  if (attached.error || !url.success || !isMercadoPagoUrl(url.data.checkoutUrl)) {
    console.error('Falha ao guardar o link de pagamento', { code: attached.error?.code })
    return { ok: false, error: CHECKOUT_FAILED }
  }
  return { ok: true, url: url.data.checkoutUrl, orderId: order.data.orderId }
}

/** Status do PRÓPRIO pedido (a página de retorno do pagamento pergunta até o webhook chegar). */
export async function orderStatusAction(orderId: unknown): Promise<OrderStatusResult> {
  const id = orderIdSchema.safeParse(orderId)
  if (!id.success) return { ok: false, error: STATUS_FAILED }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('orderstatus:' + ctx.user.id, CART_LIMITS.orderStatus)) return { ok: false, error: TOO_MANY }

  const { data, error } = await ctx.supabase.rpc('order_status', { p_order: id.data })
  if (error) {
    console.error('Falha ao ler o pedido', { code: error.code })
    return { ok: false, error: STATUS_FAILED }
  }
  const order = orderStatusSchema.safeParse(data)
  if (!order.success) return { ok: false, error: STATUS_FAILED }
  return { ok: true, order: order.data }
}
