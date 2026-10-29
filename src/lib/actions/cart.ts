'use server'

import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { CART_MAX, COUPON_MAX, quoteSchema, REDEEM_FAILED, redeemSchema, SAFE_COUPON_ERRORS, type CartQuote, type CouponResult } from '@/lib/cart'
import { CART_LIMITS, allow } from '@/lib/security/rate-limit'
import { actionContext } from './shared'

/**
 * Carrinho e cupom de lançamento (rodam SÓ no servidor).
 *
 * O navegador manda apenas ids de cursos e o código digitado. Preço, desconto, total e quem pode
 * receber o pré-acesso são calculados pelo banco (quote_cart / redeem_launch_coupon), com a conta
 * de quem está logado. Nenhum pagamento existe: nada aqui cobra nem pede dados de cartão.
 */

const EXPIRED = 'Sua sessão expirou. Entre de novo para continuar.'
const TOO_MANY = 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
const QUOTE_FAILED = 'Não foi possível atualizar o carrinho agora. Tente de novo em instantes.'

const ids = z.array(z.string().regex(ID_PATTERN)).max(CART_MAX)

const quoteInput = z.object({
  courseIds: ids,
  /** null/ausente = sem cupom; texto (mesmo vazio) = a pessoa tentou aplicar este código. */
  couponCode: z.string().max(COUPON_MAX).nullable().optional(),
})

export type QuoteResult = { ok: true; quote: CartQuote } | { ok: false; error: string }

/** Preços, desconto e total do carrinho, calculados pelo banco. */
export async function quoteCartAction(input: unknown): Promise<QuoteResult> {
  const parsed = quoteInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: QUOTE_FAILED }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  const code = parsed.data.couponCode ?? null
  if (!allow('cart:' + ctx.user.id, CART_LIMITS.quote)) return { ok: false, error: TOO_MANY }
  if (code !== null && !allow('coupon:' + ctx.user.id, CART_LIMITS.coupon)) return { ok: false, error: TOO_MANY }

  const { data, error } = await ctx.supabase.rpc('quote_cart', { p_course_ids: parsed.data.courseIds, p_code: code })
  if (error) {
    if (error.code !== 'PGRST202') console.error('Falha ao calcular o carrinho', { code: error.code })
    return { ok: false, error: QUOTE_FAILED }
  }
  const quote = quoteSchema.safeParse(data)
  if (!quote.success) {
    console.error('Resposta inesperada do carrinho')
    return { ok: false, error: QUOTE_FAILED }
  }
  return { ok: true, quote: quote.data }
}

const redeemInput = z.object({ courseIds: ids.min(1), couponCode: z.string().max(COUPON_MAX) })

/**
 * Libera o pré-acesso de lançamento aos cursos elegíveis do carrinho. O banco recalcula tudo,
 * confere o cupom e grava a liberação (30 dias, sem renovação). Sem pagamento.
 */
export async function redeemCouponAction(input: unknown): Promise<CouponResult> {
  const parsed = redeemInput.safeParse(input)
  if (!parsed.success) return { ok: false, error: REDEEM_FAILED }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: EXPIRED }
  if (!allow('redeem:' + ctx.user.id, CART_LIMITS.redeem)) return { ok: false, error: TOO_MANY }

  const { data, error } = await ctx.supabase.rpc('redeem_launch_coupon', {
    p_course_ids: parsed.data.courseIds,
    p_code: parsed.data.couponCode,
  })
  if (error) {
    if (error.code === 'FY429') return { ok: false, error: TOO_MANY }
    // FC422 = o banco escreveu a mensagem para a tela (cupom inválido, promoção encerrada…).
    if (error.code === 'FC422' && error.message && SAFE_COUPON_ERRORS.includes(error.message)) return { ok: false, error: error.message }
    console.error('Falha ao liberar o pré-acesso', { code: error.code })
    return { ok: false, error: REDEEM_FAILED }
  }
  const result = redeemSchema.safeParse(data)
  if (!result.success) {
    console.error('Resposta inesperada ao liberar o pré-acesso')
    return { ok: false, error: REDEEM_FAILED }
  }
  return { ok: true, ...result.data }
}
