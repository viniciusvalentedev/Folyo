import { z } from 'zod'
import { sendOrderReceipt } from '@/lib/email/send'
import { fetchPayment, webhookConfig } from '@/lib/payments/mercadopago'
import { verifyMercadoPagoSignature } from '@/lib/payments/signature'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * Webhook do Mercado Pago (POST /api/webhooks/mercadopago): o único lugar que libera um curso comprado.
 *
 * Nada que vem na notificação é confiado. O caminho é:
 *  1. A assinatura (x-signature) é conferida com a chave secreta do webhook, usando o `data.id` da URL. Sem
 *     assinatura certa: 401 e nada mais acontece.
 *  2. O pagamento é CONSULTADO na API do Mercado Pago com o nosso token (status, valor, moeda e pedido vêm de lá).
 *  3. O banco (apply_payment, só executável pela chave secreta) confere valor e moeda contra o pedido que ELE
 *     gravou, é idempotente e libera o acesso (ou tira, no estorno).
 *  4. Pedido pago: o recibo é enviado por e-mail, no máximo uma vez (o banco reserva o envio). O e-mail é cortesia: se
 *     falhar, a resposta continua 200, porque o curso já foi liberado.
 *
 * Códigos de resposta: 200 = recebido (inclusive o que não nos interessa, para o Mercado Pago não reenviar);
 * 401 = assinatura inválida; 400/413 = pedido malformado; 500/503 = falha nossa ou do Mercado Pago, que
 * reenvia a notificação depois. Nenhuma resposta traz detalhes internos, e nenhum log leva token, chave ou dado pessoal.
 *
 * Esta rota não tem sessão de aluno: o proxy a deixa passar (src/proxy.ts) e a autenticação é a assinatura.
 */

const MAX_BODY = 20_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const applied = z.object({ result: z.string().max(60) })
/** Resultados que pedem atenção de uma pessoa (dinheiro entrou, mas algo não bate). */
const NEEDS_ATTENTION = new Set(['valor_divergente', 'pagamento_duplicado', 'sem_conta'])

const reply = (status: number, body: Record<string, unknown> = { ok: true }) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request) {
  const cfg = webhookConfig()
  if (!cfg) {
    console.error('Webhook de pagamento sem configuração (token ou chave secreta do webhook ausentes)')
    return reply(503, { ok: false })
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_BODY) return reply(413, { ok: false })
  const text = await request.text().catch(() => '')
  if (text.length > MAX_BODY) return reply(413, { ok: false })

  const params = new URL(request.url).searchParams
  const dataId = params.get('data.id')
  const signature = verifyMercadoPagoSignature({
    xSignature: request.headers.get('x-signature'),
    xRequestId: request.headers.get('x-request-id'),
    dataId,
    secret: cfg.webhookSecret,
  })
  if (!signature.ok) {
    console.warn('Webhook de pagamento recusado', { reason: signature.reason })
    return reply(401, { ok: false })
  }

  // Só nos interessam pagamentos. O tipo vem na URL; o corpo é só o plano B (e nunca decide mais nada).
  let type = params.get('type')
  if (!type) {
    try {
      const body: unknown = JSON.parse(text)
      type = typeof body === 'object' && body !== null && 'type' in body && typeof body.type === 'string' ? body.type : null
    } catch {
      type = null
    }
  }
  if (type !== 'payment') return reply(200, { ok: true, ignored: 'tipo' })
  if (!dataId || !/^\d{1,20}$/.test(dataId)) return reply(400, { ok: false })

  let lookup
  try {
    lookup = await fetchPayment(cfg, dataId)
  } catch (error) {
    console.error('Falha ao consultar o pagamento no Mercado Pago', { status: error instanceof Error && 'status' in error ? error.status : undefined })
    return reply(500, { ok: false })
  }
  if (lookup.kind === 'not_found') return reply(200, { ok: true, ignored: 'pagamento_inexistente' })

  const payment = lookup.payment
  if (!payment.externalReference || !UUID.test(payment.externalReference) || payment.amountCents > 2_000_000_000) {
    return reply(200, { ok: true, ignored: 'sem_pedido' })
  }

  let supabase
  try {
    supabase = createSupabaseServiceClient()
  } catch {
    console.error('Webhook de pagamento sem a chave secreta do Supabase')
    return reply(503, { ok: false })
  }
  const { data, error } = await supabase.rpc('apply_payment', {
    p_order: payment.externalReference.toLowerCase(),
    p_payment_id: payment.id,
    p_status: payment.status,
    p_amount_cents: payment.amountCents,
    p_currency: payment.currency,
  })
  if (error) {
    console.error('Falha ao aplicar o pagamento', { code: error.code })
    return reply(500, { ok: false })
  }
  const result = applied.safeParse(data)
  if (!result.success) {
    console.error('Resposta inesperada ao aplicar o pagamento')
    return reply(500, { ok: false })
  }
  const log = { result: result.data.result, orderId: payment.externalReference, paymentId: payment.id }
  if (NEEDS_ATTENTION.has(result.data.result)) console.error('Pagamento precisa de atenção', log)
  else console.info('Pagamento aplicado', log)

  // Também em 'ja_processado': se o e-mail falhou da primeira vez, o próximo aviso do Mercado Pago tenta de novo.
  if (result.data.result === 'liberado' || result.data.result === 'ja_processado') {
    await sendOrderReceipt(supabase, payment.externalReference.toLowerCase())
  }
  return reply(200)
}
