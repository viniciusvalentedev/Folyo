import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { fetchGatewayOrder, type GatewayOrder, type MercadoPagoConfig } from '@/lib/payments/mercadopago'
import { mapGatewayStatus } from '@/lib/payments/status'

/**
 * Concilia uma ordem do Mercado Pago com o nosso banco: é o ÚNICO caminho que libera ou tira acesso a curso.
 *
 * Quem chama: o webhook (aviso do Mercado Pago), o servidor logo depois de criar um pagamento aprovado e o botão
 * "conferir pagamento" da tela. Em todos os casos o que vale é a ordem lida da API do Mercado Pago com o NOSSO token
 * (nunca o corpo de uma notificação ou algo que veio do navegador), e o banco (apply_payment) ainda confere valor e
 * moeda contra o pedido que ELE gravou, é idempotente e só o service_role executa.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const applied = z.object({ result: z.string().max(60) })
const settled = z.object({ orderId: z.uuid().nullable().optional() })
/** Resultados que pedem atenção de uma pessoa (dinheiro entrou, mas algo não bate). */
const NEEDS_ATTENTION = new Set(['valor_divergente', 'pagamento_duplicado', 'sem_conta'])

/** Falha nossa ao falar com o banco (o webhook responde erro e o Mercado Pago avisa de novo). */
export class ReconcileError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ReconcileError'
  }
}

export type ReconcileOutcome =
  | { kind: 'ignorado'; reason: 'sem_ordem' | 'sem_pedido' | 'estado_desconhecido' | 'pagamento_anomalo' }
  /** A ordem do Mercado Pago pertence a outro pedido do que a tentativa registrada: nada é aplicado. */
  | { kind: 'inconsistente'; orderId: string }
  | { kind: 'ok'; orderId: string; result: string | null; receiptDue: boolean }

type Rpc = Pick<SupabaseClient, 'rpc'>

/** Aplica uma ordem JÁ LIDA da API do Mercado Pago (aprovada, recusada, estornada...). */
export async function applyGatewayOrder(supabase: Rpc, order: GatewayOrder): Promise<ReconcileOutcome> {
  const reference = order.externalReference
  if (!reference || !UUID.test(reference)) return { kind: 'ignorado', reason: 'sem_pedido' }
  const orderId = reference.toLowerCase()
  const decision = mapGatewayStatus(order.status, order.statusDetail)
  if (!decision.state) {
    console.warn('Estado de pagamento desconhecido', { orderId, status: order.status, detail: order.statusDetail })
    return { kind: 'ignorado', reason: 'estado_desconhecido' }
  }
  const payment = order.payment

  const attempt = await supabase.rpc('settle_payment_attempt', {
    p_provider_order_id: order.id,
    p_status: decision.state,
    p_status_detail: payment?.statusDetail ?? order.statusDetail ?? null,
    p_provider_payment_id: payment?.id ?? null,
  })
  if (attempt.error) throw new ReconcileError('Falha ao atualizar a tentativa de pagamento', attempt.error.code)
  const known = settled.safeParse(attempt.data)
  if (!known.success) throw new ReconcileError('Resposta inesperada ao atualizar a tentativa')
  if (known.data.orderId && known.data.orderId !== orderId) {
    // Não deveria acontecer: a tentativa que registramos para esta ordem é de outro pedido. Não aplica nada.
    console.error('Ordem do Mercado Pago aponta para outro pedido do que a tentativa registrada', { providerOrderId: order.id, orderId })
    return { kind: 'inconsistente', orderId }
  }

  if (!decision.apply) return { kind: 'ok', orderId, result: null, receiptDue: false }

  // Criamos sempre UM pagamento por ordem. Mais (ou nenhum) é anormal: não libera nada sozinho.
  const amount = payment?.amountCents ?? null
  if (!payment || order.paymentCount !== 1 || amount === null || amount > 2_000_000_000) {
    console.error('Ordem com pagamento anormal', { orderId, status: order.status, payments: order.paymentCount })
    return { kind: 'ignorado', reason: 'pagamento_anomalo' }
  }
  const result = await supabase.rpc('apply_payment', {
    p_order: orderId,
    p_payment_id: payment.id,
    p_status: decision.apply,
    p_amount_cents: amount,
    p_currency: order.currency,
  })
  if (result.error) throw new ReconcileError('Falha ao aplicar o pagamento', result.error.code)
  const parsed = applied.safeParse(result.data)
  if (!parsed.success) throw new ReconcileError('Resposta inesperada ao aplicar o pagamento')

  const log = { result: parsed.data.result, orderId, paymentId: payment.id }
  if (NEEDS_ATTENTION.has(parsed.data.result)) console.error('Pagamento precisa de atenção', log)
  else console.info('Pagamento aplicado', log)

  // Também em 'ja_processado': se o e-mail falhou da primeira vez, o próximo aviso do Mercado Pago tenta de novo.
  const receiptDue = parsed.data.result === 'liberado' || parsed.data.result === 'ja_processado'
  return { kind: 'ok', orderId, result: parsed.data.result, receiptDue }
}

/** Consulta a ordem na API do Mercado Pago e aplica. Lança GatewayError (API) ou ReconcileError (banco). */
export async function reconcileGatewayOrder(cfg: MercadoPagoConfig, supabase: Rpc, providerOrderId: string): Promise<ReconcileOutcome> {
  const lookup = await fetchGatewayOrder(cfg, providerOrderId)
  if (lookup.kind === 'not_found') return { kind: 'ignorado', reason: 'sem_ordem' }
  return applyGatewayOrder(supabase, lookup.order)
}
