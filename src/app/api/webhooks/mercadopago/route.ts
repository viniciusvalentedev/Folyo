import { fetchGatewayOrder, GatewayError, webhookConfig, type OrderLookup } from '@/lib/payments/mercadopago'
import { applyGatewayOrder, ReconcileError } from '@/lib/payments/reconcile'
import { verifyMercadoPagoSignature } from '@/lib/payments/signature'
import { sendOrderReceipt } from '@/lib/email/send'
import { createSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * Webhook do Mercado Pago (POST /api/webhooks/mercadopago): o aviso de que uma ordem de pagamento mudou. Junto com
 * "conferir pagamento" da tela, é o único lugar que libera um curso comprado.
 *
 * Nada que vem na notificação é confiado. O caminho é:
 *  1. A assinatura (x-signature) é conferida com a chave secreta do webhook, usando o `data.id` da URL. Sem
 *     assinatura certa: 401 e nada mais acontece.
 *  2. A ordem é CONSULTADA na API do Mercado Pago com o nosso token (status, valor, moeda e pedido vêm de lá).
 *  3. O banco (apply_payment, só executável pela chave secreta) confere valor e moeda contra o pedido que ELE
 *     gravou, é idempotente e libera o acesso (ou tira, no estorno).
 *  4. Pedido pago: o recibo é enviado por e-mail, no máximo uma vez (o banco reserva o envio). O e-mail é cortesia: se
 *     falhar, a resposta continua 200, porque o curso já foi liberado.
 *
 * Evento a marcar no painel do Mercado Pago: "Order (Mercado Pago)" (tipo `order`).
 *
 * Códigos de resposta: 200 = recebido (inclusive o que não nos interessa, para o Mercado Pago não reenviar);
 * 401 = assinatura inválida; 400/413 = pedido malformado; 500/503 = falha nossa ou do Mercado Pago, que
 * reenvia a notificação depois. Nenhuma resposta traz detalhes internos, e nenhum log leva token, chave ou dado pessoal.
 *
 * Esta rota não tem sessão de aluno: o proxy a deixa passar (src/proxy.ts) e a autenticação é a assinatura.
 */

const MAX_BODY = 20_000
const ORDER_ID = /^[0-9A-Za-z_-]{1,64}$/

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
  // O Mercado Pago monta a assinatura com o id em minúsculas quando ele tem letras; confere o id como veio e em minúsculas.
  const variants = dataId ? [...new Set([dataId, dataId.toLowerCase()])] : [dataId]
  const results = variants.map((id) =>
    verifyMercadoPagoSignature({
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
      dataId: id,
      secret: cfg.webhookSecret,
    }),
  )
  const signature = results.find((r) => r.ok) ?? results[0]
  if (!signature.ok) {
    console.warn('Webhook de pagamento recusado', { reason: signature.reason })
    return reply(401, { ok: false })
  }

  // Só nos interessam ordens de pagamento. O tipo vem na URL; o corpo é só o plano B (e nunca decide mais nada).
  let type = params.get('type')
  if (!type) {
    try {
      const body: unknown = JSON.parse(text)
      type = typeof body === 'object' && body !== null && 'type' in body && typeof body.type === 'string' ? body.type : null
    } catch {
      type = null
    }
  }
  if (type !== 'order') return reply(200, { ok: true, ignored: 'tipo' })
  if (!dataId || !ORDER_ID.test(dataId)) return reply(400, { ok: false })

  let supabase
  try {
    supabase = createSupabaseServiceClient()
  } catch {
    console.error('Webhook de pagamento sem a chave secreta do Supabase')
    return reply(503, { ok: false })
  }

  try {
    // Os ids de ordem são em maiúsculas; se o aviso trouxer minúsculas, tenta de novo como o Mercado Pago os escreve.
    let lookup: OrderLookup = await fetchGatewayOrder(cfg, dataId)
    if (lookup.kind === 'not_found' && dataId !== dataId.toUpperCase()) lookup = await fetchGatewayOrder(cfg, dataId.toUpperCase())
    if (lookup.kind === 'not_found') return reply(200, { ok: true, ignored: 'ordem_inexistente' })

    const outcome = await applyGatewayOrder(supabase, lookup.order)
    if (outcome.kind === 'ignorado') return reply(200, { ok: true, ignored: outcome.reason })
    if (outcome.kind === 'inconsistente') return reply(200, { ok: true, ignored: 'inconsistente' })
    // Também em 'ja_processado': se o e-mail falhou da primeira vez, o próximo aviso do Mercado Pago tenta de novo.
    if (outcome.receiptDue) await sendOrderReceipt(supabase, outcome.orderId)
    return reply(200)
  } catch (error) {
    if (error instanceof GatewayError) console.error('Falha ao consultar a ordem no Mercado Pago', { status: error.status })
    else if (error instanceof ReconcileError) console.error(error.message, { code: error.code })
    else console.error('Falha ao processar o aviso de pagamento')
    return reply(500, { ok: false })
  }
}
