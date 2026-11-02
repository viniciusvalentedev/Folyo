import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Assinatura das notificações (webhooks) do Mercado Pago.
 *
 * O Mercado Pago manda o cabeçalho `x-signature: ts=<segundos>,v1=<hash>`. O hash é um HMAC-SHA256, em hexadecimal,
 * da string "manifest" feita com o id do pagamento (parâmetro `data.id` da URL), o cabeçalho `x-request-id` e o `ts`,
 * usando a "chave secreta" do webhook (Suas integrações → Webhooks). Peça sem a informação fica de fora:
 *
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 *
 * Este arquivo segue a implementação do SDK oficial do Mercado Pago (mercadopago@3.6.1, utils/webhook), e os testes
 * usam valores calculados por ele. Não confere a "idade" do ts de propósito: o Mercado Pago reenvia notificações a
 * cada 15 minutos enquanto não receber 200, e rejeitar reenvios antigos perderia pagamentos. Repetir uma notificação
 * verdadeira não adianta nada para um atacante: quem decide é o pagamento consultado na API e o banco é idempotente.
 *
 * (Arquivo sem 'server-only' para os testes; só a rota do webhook usa.)
 */

export type SignatureFailure = 'sem_chave' | 'sem_cabecalho' | 'cabecalho_invalido' | 'sem_assinatura' | 'assinatura_diferente'

export type SignatureInput = {
  xSignature: string | null | undefined
  xRequestId: string | null | undefined
  /** Parâmetro `data.id` da URL (nunca o corpo da notificação). */
  dataId: string | null | undefined
  secret: string | null | undefined
}

const clean = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** "ts=123,v1=abc" → { ts, v1 }. Chaves desconhecidas são ignoradas. */
function parseHeader(header: string) {
  let ts: string | undefined
  let v1: string | undefined
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (!key || !value) continue
    if (key === 'ts') ts = value
    else if (key === 'v1') v1 = value
  }
  return { ts, v1 }
}

export function verifyMercadoPagoSignature(input: SignatureInput): { ok: true } | { ok: false; reason: SignatureFailure } {
  const secret = input.secret
  if (!secret) return { ok: false, reason: 'sem_chave' }
  const header = clean(input.xSignature)
  if (!header) return { ok: false, reason: 'sem_cabecalho' }
  const { ts, v1 } = parseHeader(header)
  if (!ts || !/^\d{1,16}$/.test(ts)) return { ok: false, reason: 'cabecalho_invalido' }
  if (!v1) return { ok: false, reason: 'sem_assinatura' }

  const dataId = clean(input.dataId)
  const requestId = clean(input.xRequestId)
  const manifest = [dataId ? `id:${dataId}` : null, requestId ? `request-id:${requestId}` : null, `ts:${ts}`].filter(Boolean).join(';') + ';'
  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'))
  const received = Buffer.from(v1)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return { ok: false, reason: 'assinatura_diferente' }
  return { ok: true }
}
