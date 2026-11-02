import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Rota do webhook (POST /api/webhooks/mercadopago): sem rede e sem banco de verdade (fetch e Supabase simulados).
 * O que se garante aqui: sem assinatura certa nada acontece; o pagamento é sempre consultado na API do Mercado Pago;
 * o que vai para o banco vem da API (nunca do corpo da notificação); falhas nossas respondem erro (o Mercado Pago reenvia).
 */

const rpc = vi.fn()
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ rpc }) }))
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }))

import { POST } from '@/app/api/webhooks/mercadopago/route'

const SECRET = 'segredo-do-webhook-de-teste'
const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const URL_BASE = 'https://www.usefolyo.com/api/webhooks/mercadopago'

function signed(opts: { dataId?: string | null; type?: string | null; body?: unknown; secret?: string; requestId?: string; ts?: string } = {}) {
  const dataId = opts.dataId === undefined ? '123456789' : opts.dataId
  const requestId = opts.requestId ?? 'req-1'
  const ts = opts.ts ?? '1793600000'
  const manifest = [dataId ? `id:${dataId}` : null, `request-id:${requestId}`, `ts:${ts}`].filter(Boolean).join(';') + ';'
  const v1 = createHmac('sha256', opts.secret ?? SECRET).update(manifest).digest('hex')
  const qs = new URLSearchParams()
  if (dataId) qs.set('data.id', dataId)
  if (opts.type !== null) qs.set('type', opts.type ?? 'payment')
  return new Request(`${URL_BASE}?${qs}`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId, 'content-type': 'application/json' },
    body: JSON.stringify(opts.body ?? { type: 'payment', data: { id: dataId } }),
  })
}

const payment = (over: Record<string, unknown> = {}) => ({ id: 123456789, status: 'approved', transaction_amount: 82.89, currency_id: 'BRL', external_reference: ORDER, ...over })

describe('webhook do Mercado Pago', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TOKEN-DE-TESTE')
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', SECRET)
    rpc.mockReset()
    rpc.mockResolvedValue({ data: { result: 'liberado', orderId: ORDER }, error: null })
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payment()), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('assinatura certa: consulta o pagamento na API e manda ao banco os valores DA API', async () => {
    const res = await POST(signed())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.mercadopago.com/v1/payments/123456789')
    expect(rpc).toHaveBeenCalledWith('apply_payment', {
      p_order: ORDER,
      p_payment_id: '123456789',
      p_status: 'approved',
      p_amount_cents: 8289,
      p_currency: 'BRL',
    })
  })

  test('o corpo da notificação não decide nada: valores falsos nele são ignorados', async () => {
    const res = await POST(signed({ body: { type: 'payment', data: { id: '123456789' }, status: 'approved', transaction_amount: 0.01, external_reference: 'outro' } }))
    expect(res.status).toBe(200)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_order: ORDER, p_amount_cents: 8289 })
  })

  test.each([
    ['chave errada', { secret: 'outra-chave' }],
    ['id do pagamento trocado na URL', {}],
  ])('assinatura inválida (%s): 401 e nada é consultado nem gravado', async (_name, opts) => {
    const req = signed(opts)
    const target = _name.startsWith('id') ? new Request(req.url.replace('123456789', '999999999'), { method: 'POST', headers: req.headers, body: '{}' }) : req
    const res = await POST(target)
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('sem cabeçalho de assinatura: 401', async () => {
    const res = await POST(new Request(`${URL_BASE}?data.id=1&type=payment`, { method: 'POST', body: '{}' }))
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

  test('com a venda desligada (PAYMENTS_ENABLED) o webhook continua processando (o dinheiro que entrou não pode ficar sem curso)', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    expect((await POST(signed())).status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('tipos que não são pagamento: 200 e ignorado', async () => {
    for (const type of ['merchant_order', 'plan', 'subscription_preapproval']) {
      const res = await POST(signed({ type }))
      expect(res.status).toBe(200)
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('tipo só no corpo (sem na URL) também vale', async () => {
    const res = await POST(signed({ type: null, body: { type: 'payment' } }))
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('data.id ausente ou fora do formato: 400', async () => {
    expect((await POST(signed({ dataId: null }))).status).toBe(400)
    expect((await POST(signed({ dataId: 'abc' }))).status).toBe(400)
    expect((await POST(signed({ dataId: '../x' }))).status).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('corpo grande demais: 413 antes de qualquer coisa', async () => {
    const req = new Request(`${URL_BASE}?data.id=1&type=payment`, { method: 'POST', headers: { 'content-length': '50000' }, body: '{}' })
    expect((await POST(req)).status).toBe(413)
    const big = signed({ body: { lixo: 'x'.repeat(30_000) } })
    expect((await POST(big)).status).toBe(413)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('pagamento que não existe na API (notificação de teste): 200, sem banco', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 404 }))
    expect((await POST(signed())).status).toBe(200)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('API do Mercado Pago fora do ar: 500 (eles reenviam) e nada é gravado', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }))
    expect((await POST(signed())).status).toBe(500)
    fetchMock.mockRejectedValue(new Error('rede'))
    expect((await POST(signed())).status).toBe(500)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('pagamento sem pedido nosso (referência vazia ou que não é um id): 200 e ignorado', async () => {
    for (const external_reference of [null, '', 'pedido-123', "'; drop table x;--"]) {
      fetchMock.mockResolvedValue(new Response(JSON.stringify(payment({ external_reference })), { status: 200 }))
      expect((await POST(signed())).status).toBe(200)
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  test('erro do banco: 500 (reenvio); resposta estranha do banco: 500', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } })
    expect((await POST(signed())).status).toBe(500)
    rpc.mockResolvedValue({ data: { algo: 'diferente' }, error: null })
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

  test('estorno é repassado ao banco com o status da API', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payment({ status: 'refunded' })), { status: 200 }))
    rpc.mockResolvedValue({ data: { result: 'revogado' }, error: null })
    expect((await POST(signed())).status).toBe(200)
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_status: 'refunded' })
  })

  test('resultado que pede atenção (valor divergente) é registrado como erro, mas responde 200 (não adianta reenviar)', async () => {
    rpc.mockResolvedValue({ data: { result: 'valor_divergente' }, error: null })
    expect((await POST(signed())).status).toBe(200)
    expect(console.error).toHaveBeenCalledWith('Pagamento precisa de atenção', expect.objectContaining({ result: 'valor_divergente' }))
  })

  test('nada sensível vai para os logs (token, chave, assinatura)', async () => {
    await POST(signed({ secret: 'outra' }))
    await POST(signed())
    const logged = JSON.stringify([...vi.mocked(console.info).mock.calls, ...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls])
    expect(logged).not.toContain('TOKEN-DE-TESTE')
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
      smtp.createTransport.mockReset().mockReturnValue({ sendMail: smtp.sendMail, close: vi.fn() })
      rpc.mockImplementation(async (fn: string) => {
        if (fn === 'apply_payment') return { data: { result: applyResult, orderId: ORDER }, error: null }
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
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['apply_payment'])
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
      expect(rpc.mock.calls.map((c) => c[0])).toEqual(['apply_payment'])
    })
  })
})
