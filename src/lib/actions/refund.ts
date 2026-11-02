'use server'

import { z } from 'zod'
import { fetchGatewayOrder, GatewayError, refundGatewayOrder, webhookConfig, type GatewayOrder } from '@/lib/payments/mercadopago'
import { orderIdSchema, type RefundResult } from '@/lib/payments/order'
import { applyGatewayOrder, type ReconcileOutcome } from '@/lib/payments/reconcile'
import { mapGatewayStatus } from '@/lib/payments/status'
import { allow, CART_LIMITS } from '@/lib/security/rate-limit'
import { createSupabaseServiceClient } from '@/lib/supabase/service'
import { fromDb, TOO_MANY } from './admin-shared'
import { actionContext, EXPIRED, FAILED, INVALID } from './shared'

/**
 * Estorno pelo painel (roda SÓ no servidor): o botão "Estornar" da ficha do aluno.
 *
 * Como toda Server Action, é uma porta aberta para a internet. Por isso ela NÃO decide quem pode estornar: o BANCO decide
 * (admin_refund_begin confere o papel de administrador ou acima, com a verificação em duas etapas, confere que o pedido
 * está pago pelo site e registra no histórico do painel quem pediu e por quê). Só depois disso o servidor pede o estorno
 * TOTAL ao Mercado Pago, que devolve o dinheiro ao aluno.
 *
 * O acesso aos cursos continua saindo de um lugar só: apply_payment, depois de ler a ordem na API do Mercado Pago (o mesmo
 * caminho do aviso/webhook). Se o Mercado Pago ainda não tiver terminado, o aviso dele conclui em instantes.
 */

const input = z.object({ orderId: orderIdSchema, reason: z.string().max(300).default('') })
const began = z.object({ orderId: orderIdSchema, providerOrderId: z.string().regex(/^[0-9A-Za-z_-]{1,64}$/) })

const UNAVAILABLE = 'O estorno pelo painel precisa das chaves do Mercado Pago no servidor. Estorne pelo painel do Mercado Pago.'
const REFUSED = 'O Mercado Pago não aceitou o estorno agora (ele pode já ter sido feito ou o pagamento ainda não foi liberado para estorno). Confira o pedido no painel do Mercado Pago.'
const UNSURE = 'Não conseguimos confirmar o estorno com o Mercado Pago. Atualize a página e confira o pedido antes de tentar de novo.'

export async function refundOrderAction(raw: unknown): Promise<RefundResult> {
  const parsed = input.safeParse(raw)
  if (!parsed.success) return INVALID
  const cfg = webhookConfig()
  if (!cfg) return { ok: false, error: UNAVAILABLE }
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('refund:' + ctx.user.id, CART_LIMITS.refund)) return TOO_MANY

  // 1. O banco confere o papel, o pedido e registra quem pediu. Sem isso, nada é pedido ao Mercado Pago.
  const begun = await ctx.supabase.rpc('admin_refund_begin', { p_order: parsed.data.orderId, p_reason: parsed.data.reason.trim() })
  if (begun.error) return fromDb('admin_refund_begin', ctx.user.id, begun.error)
  const target = began.safeParse(begun.data)
  if (!target.success || target.data.orderId !== parsed.data.orderId) {
    console.error('Resposta inesperada ao pedir o estorno')
    return FAILED
  }

  let supabase: ReturnType<typeof createSupabaseServiceClient>
  try {
    supabase = createSupabaseServiceClient()
  } catch {
    console.error('Estorno sem a chave secreta do Supabase')
    return { ok: false, error: UNAVAILABLE }
  }

  // 2. Pede o estorno TOTAL ao Mercado Pago. Se der erro, lê a ordem de novo: ele pode ter estornado mesmo assim (tempo esgotado).
  let gateway: GatewayOrder | null = null
  let failure: string | null = null
  try {
    gateway = await refundGatewayOrder(cfg, target.data.providerOrderId)
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : undefined
    console.error('Falha ao estornar no Mercado Pago', { orderId: parsed.data.orderId, status })
    failure = status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429 ? REFUSED : UNSURE
    try {
      const lookup = await fetchGatewayOrder(cfg, target.data.providerOrderId)
      if (lookup.kind === 'ok') gateway = lookup.order
    } catch {
      // Mercado Pago fora do ar: o aviso dele conclui depois, se o estorno tiver acontecido.
    }
  }
  if (!gateway) return { ok: false, error: failure ?? UNSURE }

  // 3. Aplica o que a ordem diz (estornada: tira o acesso comprado). Só vale o que foi LIDO do Mercado Pago.
  const decision = mapGatewayStatus(gateway.status, gateway.statusDetail)
  const refunded = decision.apply === 'refunded' || decision.apply === 'charged_back'
  if (failure && !refunded) return { ok: false, error: failure }
  let outcome: ReconcileOutcome | null = null
  try {
    outcome = await applyGatewayOrder(supabase, gateway)
  } catch {
    // O estorno já foi pedido; se aplicar falhar agora, o aviso do Mercado Pago aplica.
    console.error('Falha ao aplicar o estorno; o aviso do Mercado Pago aplica depois', { orderId: parsed.data.orderId })
  }
  console.info('Estorno pedido pelo painel', { orderId: parsed.data.orderId, result: outcome?.kind === 'ok' ? outcome.result : null })
  return { ok: true, done: outcome?.kind === 'ok' && outcome.result === 'revogado' }
}
