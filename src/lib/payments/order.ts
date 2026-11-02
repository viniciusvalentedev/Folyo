import { z } from 'zod'

/**
 * Pedido, pagamento e mensagens (navegador e servidor).
 *
 * ATENÇÃO: nada aqui decide preço nem acesso. O pedido é criado pelo banco (create_order) a partir dos ids dos
 * cursos; o acesso só é liberado pelo webhook (apply_payment, depois de consultar o pagamento no Mercado Pago).
 * A página que o aluno vê depois de pagar só LÊ o status do pedido.
 */

export const CHECKOUT_UNAVAILABLE = 'O pagamento online ainda não está disponível.'
export const CHECKOUT_FAILED = 'Não foi possível abrir o pagamento agora. Nada foi cobrado. Tente de novo em instantes.'
export const NOTHING_FOR_SALE = 'Nenhum curso do carrinho está à venda.'
/** Mensagens do banco (FC422) que podem ir para a tela; qualquer outra vira a genérica. */
export const SAFE_ORDER_ERRORS: readonly string[] = [NOTHING_FOR_SALE]

export const orderIdSchema = z.uuid()

/** Resposta de create_order. */
export const orderSchema = z.object({
  orderId: orderIdSchema,
  totalCents: z.number().int().min(1).max(100_000_000),
  checkoutUrl: z.string().max(600).nullable(),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200), priceCents: z.number().int().min(1) })),
})

export const attachSchema = z.object({ checkoutUrl: z.string().max(600) })

export const ORDER_STATUSES = ['pendente', 'pago', 'cancelado', 'expirado', 'reembolsado'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Resposta de order_status (o aluno só vê o próprio pedido). */
export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  totalCents: z.number().int(),
  paidAt: z.string().nullable(),
  items: z.array(z.object({ courseId: z.string().max(40), title: z.string().max(200) })),
})
export type OrderStatusInfo = z.infer<typeof orderStatusSchema>

/** Uma compra na lista "Minhas compras" (resposta de my_orders). O link de pagamento só vem em pedido em aberto. */
export const myOrderSchema = z.object({
  id: orderIdSchema,
  status: z.enum(ORDER_STATUSES),
  totalCents: z.number().int(),
  createdAt: z.string().max(64),
  paidAt: z.string().max(64).nullable(),
  refundedAt: z.string().max(64).nullable(),
  checkoutUrl: z.string().max(600).nullable(),
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

/**
 * Só endereços do Mercado Pago (https, mercadopago.com ou mercadopago.com.br e subdomínios).
 * É a mesma regra da tabela de pedidos no banco; conferida de novo antes de mandar o aluno para lá.
 */
export function isMercadoPagoUrl(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 600 && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com(\.br)?\/[^\s]*$/.test(value)
}

export type CheckoutResult = { ok: true; url: string; orderId: string } | { ok: false; error: string }
export type OrderStatusResult = { ok: true; order: OrderStatusInfo } | { ok: false; error: string }
