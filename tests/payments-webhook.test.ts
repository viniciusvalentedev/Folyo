import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Rota do webhook (POST /api/webhooks/mercadopago) para ordens do Checkout Transparente: sem rede e sem banco de verdade
 * (fetch e Supabase simulados). O que se garante: sem assinatura certa nada acontece; a ordem é sempre consultada na API
 * do Mercado Pago; o que vai para o banco vem da API (nunca do corpo da notificação); falhas nossas respondem erro
 * (o Mercado Pago reenvia); nada sensível vai para o log.
 */

const rpc = vi.fn()
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ rpc }) }))
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }))

import { POST } from '@/app/api/webhooks/mercadopago/route'

const SECRET = 'segredo-do-webhook-de-teste'
const TOKEN = 'TOKEN-DE-TESTE'
const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const PROVIDER_ORDER = 'ORD01JTESTE0123456789ABCDEF'
const URL_BASE = 'https://www.usefolyo.com/api/webhooks/mercadopago'

/**
 * Notificação assinada. `urlId` é o data.id da URL; `signedId` é o id usado no cálculo da assinatura (o Mercado Pago o
 * calcula em minúsculas quando o id tem letras).
 */
function signed(opts: { urlId?: string | null; signedId?: string | null; type?: string | null; body?: unknown; secret?: string; requestId?: string; ts?: string } = {}) {
  const urlId = opts.urlId === undefined ? PROVIDER_ORDER : opts.urlId
  const signedId = opts.signedId === undefined ? urlId : opts.signedId
  const requestId = opts.requestId ?? 'req-1'
  const ts = opts.ts ?? '1793600000'
  const manifest = [signedId ? `id:${signedId}` : null, `request-id:${requestId}`, `ts:${ts}`].filter(Boolean).join(';') + ';'
  const v1 = createHmac('sha256', opts.secret ?? SECRET).update(manifest).digest('hex')
  const qs = new URLSearchParams()
  if (urlId) qs.set('data.id', urlId)
  if (opts.type !== null) qs.set('type', opts.type ?? 'order')
  return new Request(`${URL_BASE}?${qs}`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId, 'content-type': 'application/json' },
    body: JSON.stringify(opts.body ?? { type: 'order', data: { id: urlId } }),
  })
}

const mpOrder = (over: Record<string, unknown> = {}, pay: Record<string, unknown> = {}) => ({
  id: PROVIDER_ORDER,
  status: 'processed',
  status_detail: 'accredited',
  external_reference: ORDER,
  total_amount: '82.89',
  currency: 'BRL',
  transactions: { payments: [{ id: 'PAY01TESTE', status: 'processed', status_detail: 'accredited', amount: '82.89', ...pay }] },
  ...over,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('webhook do Mercado Pago (ordens)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  const names = () => rpc.mock.calls.map((c) => c[0])
  beforeEach(() => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', TOKEN)
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET)
    rpc.mockReset()
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
      if (fn === 'apply_payment') return { data: { result: 'liberado' }, error: null }
      return { data: null, error: null }
    })
    fetchMock = vi.fn().mockImplementation(async () => json(mpOrder()))
    vi.stubGlobal('fetch', fetchMock)
    smtp.createTransport.mockReset().mockReturnValue({ sendMail: smtp.sendMail, close: vi.fn() })
    smtp.sendMail.mockReset().mockResolvedValue({ messageId: 'x' })
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('assinatura certa: consulta a ordem na API e manda ao banco os valores DA API', async () => {
    const res = await POST(signed())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.mercadopago.com/v1/orders/${PROVIDER_ORDER}`)
    expect(JSON.stringify(init.headers)).toContain(`Bearer ${TOKEN}`)
    expect(names()).toEqual(['settle_payment_attempt', 'apply_payment'])
    expect(rpc).toHaveBeenCalledWith('apply_payment', { p_order: ORDER, p_payment_id: 'PAY01TESTE', p_status: 'approved', p_amount_cents: 8289, p_currency: 'BRL' })
  })

  test('assinatura calculada com o id em minúsculas (como o Mercado Pago faz) também vale', async () => {
    const res = await POST(signed({ urlId: PROVIDER_ORDER, signedId: PROVIDER_ORDER.toLowerCase() }))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('apply_payment', expect.objectContaining({ p_order: ORDER }))
  })

  test('aviso com id em minúsculas: se a API não acha, tenta de novo em maiúsculas', async () => {
    const lower = PROVIDER_ORDER.toLowerCase()
    fetchMock.mockImplementation(async (url: string) => (url.endsWith(PROVIDER_ORDER) ? json(mpOrder()) : json({}, 404)))
    const res = await POST(signed({ urlId: lower }))
    expect(res.status).toBe(200)
    expect(fetchMock.mock.calls.map((c) => (c as [string])[0])).toEqual([`https://api.mercadopago.com/v1/orders/${lower}`, `https://api.mercadopago.com/v1/orders/${PROVIDER_ORDER}`])
    expect(names()).toContain('apply_payment')
  })

  test('o corpo da notificação não decide nada: valores falsos nele são ignorados', async () => {
    const res = await POST(signed({ body: { type: 'order', data: { id: PROVIDER_ORDER }, status: 'processed', total_amount: '0.01', external_reference: 'outro' } }))
    expect(res.status).toBe(200)
    expect(rpc.mock.calls.find((c) => c[0] === 'apply_payment')![1]).toMatchObject({ p_order: ORDER, p_amount_cents: 8289 })
  })

  test.each([
    ['chave errada', { secret: 'outra-chave' }],
    ['id da ordem trocado na URL', { urlId: 'ORD999999999999', signedId: PROVIDER_ORDER }],
    ['request-id sem assinatura correspondente', { signedId: null }],
  ])('assinatura inválida (%s): 401 e nada é consultado nem gravado', async (_name, opts) => {
    const res = await POST(signed(opts))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('sem cabeçalho de assinatura: 401', async () => {
    const res = await POST(new Request(`${URL_BASE}?data.id=${PROVIDER_ORDER}&type=order`, { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('sem configuração (token ou chave do webhook): 503, nunca aceita', async () => {
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', '')
    expect((await POST(signed())).status).toBe(503)
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET)
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
    expect((await POST(signed())).status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('com a venda desligada (PAYMENTS_ENABLED) o webhook continua processando (dinheiro que entrou não pode ficar sem curso)', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    expect((await POST(signed())).status).toBe(200)
    expect(names()).toContain('apply_payment')
  })

  test('tipos que não são ordem (inclusive o antigo "payment"): 200 e ignorado', async () => {
    for (const type of ['payment', 'merchant_order', 'plan', 'subscription_preapproval']) {
      const res = await POST(signed({ type }))
      expect(res.status, type).toBe(200)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('tipo só no corpo (sem na URL) também vale', async () => {
    const res = await POST(signed({ type: null, body: { type: 'order' } }))
    expect(res.status).toBe(200)
    expect(names()).toContain('apply_payment')
  })

  test('data.id ausente ou fora do formato: 400', async () => {
    expect((await POST(signed({ urlId: null }))).status).toBe(400)
    expect((await POST(signed({ urlId: '../x' }))).status).toBe(400)
    expect((await POST(signed({ urlId: 'a b' }))).status).toBe(400)
    expect((await POST(signed({ urlId: 'A'.repeat(65) }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('corpo grande demais: 413 antes de qualquer coisa', async () => {
    const req = new Request(`${URL_BASE}?data.id=1&type=order`, { method: 'POST', headers: { 'content-length': '50000' }, body: '{}' })
    expect((await POST(req)).status).toBe(413)
    expect((await POST(signed({ body: { lixo: 'x'.repeat(30_000) } }))).status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('ordem que não existe na API (notificação de teste): 200, sem banco', async () => {
    fetchMock.mockImplementation(async () => json({}, 404))
    expect((await POST(signed())).status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('API do Mercado Pago fora do ar: 500 (eles reenviam) e nada é gravado', async () => {
    fetchMock.mockImplementation(async () => json({}, 503))
    expect((await POST(signed())).status).toBe(500)
    fetchMock.mockRejectedValue(new Error('rede'))
    expect((await POST(signed())).status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('ordem sem pedido nosso (referência vazia ou que não é um id): 200 e ignorada', async () => {
    for (const external_reference of [null, '', 'pedido-123', "'; drop table x;--"]) {
      fetchMock.mockImplementation(async () => json(mpOrder({ external_reference })))
      expect((await POST(signed())).status).toBe(200)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  test('ordem com pagamento anormal (dois pagamentos): 200 e nada é liberado', async () => {
    const two = mpOrder()
    two.transactions.payments.push({ id: 'PAY02', status: 'processed', status_detail: 'accredited', amount: '82.89' })
    fetchMock.mockImplementation(async () => json(two))
    expect((await POST(signed())).status).toBe(200)
    expect(names()).not.toContain('apply_payment')
  })

  test('erro do banco: 500 (reenvio); resposta estranha do banco: 500', async () => {
    rpc.mockImplementation(async () => ({ data: null, error: { code: '57014', message: 'timeout' } }))
    expect((await POST(signed())).status).toBe(500)
    rpc.mockImplementation(async (fn: string) => (fn === 'apply_payment' ? { data: { algo: 'diferente' }, error: null } : { data: { orderId: ORDER }, error: null }))
    expect((await POST(signed())).status).toBe(500)
  })

  test('chave secreta do Supabase ausente: 503 (e nada vaza na resposta)', async () => {
    vi.resetModules()
    vi.doMock('@/lib/supabase/service', () => ({
      createSupabaseServiceClient: () => {
        throw new Error('sem chave')
      },
    }))
    const { POST: post } = await import('@/app/api/webhooks/mercadopago/route')
    const res = await post(signed())
    expect(res.status).toBe(503)
    expect(await res.text()).not.toMatch(/chave|sem chave|TOKEN/)
    vi.doUnmock('@/lib/supabase/service')
  })

  test('recusado: atualiza a tentativa, nunca libera acesso', async () => {
    fetchMock.mockImplementation(async () => json(mpOrder({ status: 'failed', status_detail: 'failed' }, { status: 'failed', status_detail: 'rejected_by_issuer' })))
    expect((await POST(signed())).status).toBe(200)
    expect(names()).toEqual(['settle_payment_attempt'])
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_status: 'recusado', p_status_detail: 'rejected_by_issuer' })
  })

  test('Pix ainda não pago: não libera nada', async () => {
    fetchMock.mockImplementation(async () => json(mpOrder({ status: 'action_required', status_detail: 'waiting_transfer' }, { status: 'action_required', status_detail: 'waiting_transfer' })))
    expect((await POST(signed())).status).toBe(200)
    expect(names()).toEqual(['settle_payment_attempt'])
  })

  test('estorno é repassado ao banco com o status da API', async () => {
    fetchMock.mockImplementation(async () => json(mpOrder({ status: 'refunded', status_detail: 'refunded' }, { status: 'refunded', status_detail: 'refunded' })))
    rpc.mockImplementation(async (fn: string) => (fn === 'apply_payment' ? { data: { result: 'revogado' }, error: null } : { data: { orderId: ORDER }, error: null }))
    expect((await POST(signed())).status).toBe(200)
    expect(rpc.mock.calls.find((c) => c[0] === 'apply_payment')![1]).toMatchObject({ p_status: 'refunded' })
  })

  test('tentativa registrada para outro pedido: 200 e nada é aplicado', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'settle_payment_attempt' ? { data: { orderId: '11111111-2222-4333-8444-555555555555' }, error: null } : { data: null, error: null }))
    expect((await POST(signed())).status).toBe(200)
    expect(names()).toEqual(['settle_payment_attempt'])
  })

  test('resultado que pede atenção (valor divergente) é registrado como erro, mas responde 200 (não adianta reenviar)', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'apply_payment' ? { data: { result: 'valor_divergente' }, error: null } : { data: { orderId: ORDER }, error: null }))
    expect((await POST(signed())).status).toBe(200)
    expect(console.error).toHaveBeenCalledWith('Pagamento precisa de atenção', expect.objectContaining({ result: 'valor_divergente' }))
  })

  test('nada sensível vai para os logs (token, chave, assinatura)', async () => {
    await POST(signed({ secret: 'outra' }))
    await POST(signed())
    fetchMock.mockImplementation(async () => json({}, 503))
    await POST(signed())
    const logged = JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls])
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain(SECRET)
    expect(logged).not.toContain('v1=')
  })

  test('as respostas nunca são guardadas em cache', async () => {
    expect((await POST(signed())).headers.get('cache-control')).toBe('no-store')
    expect((await POST(signed({ secret: 'x' }))).headers.get('cache-control')).toBe('no-store')
  })

  describe('recibo por e-mail', () => {
    const RECEIPT = {
      orderId: ORDER,
      email: 'ana@exemplo.com',
      name: 'Ana Souza',
      totalCents: 8289,
      paidAt: '2026-11-02T15:30:00.000Z',
      items: [{ courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 8289 }],
    }
    function setup(applyResult: string, sendFails = false) {
      vi.stubEnv('SMTP_HOST', 'smtp.zoho.com')
      vi.stubEnv('SMTP_USER', 'contato@usefolyo.com')
      vi.stubEnv('SMTP_PASSWORD', 'senha-de-teste')
      vi.stubEnv('EMAIL_FROM', 'Folyo <contato@usefolyo.com>')
      smtp.sendMail.mockReset()
      if (sendFails) smtp.sendMail.mockRejectedValue(new Error('535 recusado'))
      else smtp.sendMail.mockResolvedValue({ messageId: 'x' })
      rpc.mockImplementation(async (fn: string) => {
        if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
        if (fn === 'apply_payment') return { data: { result: applyResult }, error: null }
        if (fn === 'claim_order_receipt') return { data: RECEIPT, error: null }
        return { data: null, error: null }
      })
    }

    test('pagamento liberado: manda o recibo para o e-mail da conta e fecha a reserva', async () => {
      setup('liberado')
      expect((await POST(signed())).status).toBe(200)
      expect(smtp.sendMail).toHaveBeenCalledTimes(1)
      expect(smtp.sendMail.mock.calls[0][0].to).toBe('ana@exemplo.com')
      expect(rpc).toHaveBeenCalledWith('claim_order_receipt', { p_order: ORDER })
      expect(rpc).toHaveBeenCalledWith('finish_order_receipt', { p_order: ORDER, p_sent: true })
    })

    test('aviso repetido (ja_processado) também tenta o recibo (o banco decide se ainda falta enviar)', async () => {
      setup('ja_processado')
      expect((await POST(signed())).status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('claim_order_receipt', { p_order: ORDER })
    })

    test.each(['sem_efeito', 'revogado', 'valor_divergente', 'pagamento_duplicado', 'sem_conta', 'pedido_inexistente'])('resultado %s: não manda recibo', async (result) => {
      setup(result)
      expect((await POST(signed())).status).toBe(200)
      expect(names()).toEqual(['settle_payment_attempt', 'apply_payment'])
      expect(smtp.sendMail).not.toHaveBeenCalled()
    })

    test('falha no envio do e-mail não derruba a confirmação: responde 200 e devolve a reserva', async () => {
      setup('liberado', true)
      expect((await POST(signed())).status).toBe(200)
      expect(rpc).toHaveBeenCalledWith('finish_order_receipt', { p_order: ORDER, p_sent: false })
    })

    test('sem configuração de e-mail: a venda segue normal, sem recibo', async () => {
      setup('liberado')
      vi.stubEnv('SMTP_PASSWORD', '')
      expect((await POST(signed())).status).toBe(200)
      expect(smtp.sendMail).not.toHaveBeenCalled()
      expect(names()).toEqual(['settle_payment_attempt', 'apply_payment'])
    })
  })
})
