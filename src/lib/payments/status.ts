import type { AttemptState } from '@/lib/payments/order'

/**
 * Traduz o estado do pedido do Mercado Pago (API de Orders) para o que o Folyo faz com ele.
 *
 * `state` é o estado da tentativa de pagamento no nosso banco (null = estado que não conhecemos: não mexe em nada e
 * vai para o log). `apply` é o que vai para apply_payment, a única porta que libera ou tira acesso a curso:
 *  - 'approved' SÓ para processed + accredited (ou partially_refunded: o dinheiro entrou e o reembolso foi parcial).
 *    Qualquer outro detalhe de "processed" não libera nada.
 *  - 'refunded' / 'charged_back' tiram o acesso comprado.
 */
export type GatewayDecision = { state: AttemptState | null; apply: 'approved' | 'refunded' | 'charged_back' | null }

const NONE: GatewayDecision = { state: null, apply: null }

export function mapGatewayStatus(status: string | null | undefined, detail: string | null | undefined): GatewayDecision {
  const s = (status ?? '').toLowerCase()
  const d = (detail ?? '').toLowerCase()
  switch (s) {
    case 'processed':
      return d === 'accredited' || d === 'partially_refunded' ? { state: 'aprovado', apply: 'approved' } : NONE
    case 'refunded':
      return { state: 'reembolsado', apply: 'refunded' }
    case 'charged_back':
      return { state: 'reembolsado', apply: 'charged_back' }
    case 'action_required':
      return { state: d === 'waiting_transfer' ? 'aguardando_pix' : 'aguardando_acao', apply: null }
    case 'created':
    case 'processing':
      return { state: 'processando', apply: null }
    case 'failed':
      return { state: 'recusado', apply: null }
    case 'canceled':
    case 'cancelled':
      return { state: 'cancelado', apply: null }
    case 'expired':
      return { state: 'expirado', apply: null }
    default:
      return NONE
  }
}
