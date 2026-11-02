import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPreference, fetchPayment, GatewayError, type MercadoPagoConfig } from '@/lib/payments/mercadopago'
import { isMercadoPagoUrl } from '@/lib/payments/order'

const cfg: MercadoPagoConfig = { accessToken: 'TOKEN-SECRETO-DE-TESTE', webhookSecret: 'x', useSandboxUrl: false, siteUrl: 'https://www.usefolyo.com' }
const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('isMercadoPagoUrl', () => {
  test.each([
    'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1-abc',
    'https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=1-abc',
    'https://mercadopago.com/checkout',
    'https://www.mercadopago.com/mlb/checkout/start?pref_id=1',
  ])('aceita %s', (url) => expect(isMercadoPagoUrl(url)).toBe(true))

  test.each([
    'http://www.mercadopago.com.br/checkout',
    'https://mercadopago.com.br.evil.com/checkout',
    'https://evil.com/mercadopago.com.br/',
    'https://www.mercadopago.com.br@evil.com/x',
    'https://evilmercadopago.com.br/x',
    'https://www.mercadopago.com.br',
    'https://www.mercadopago.com.br/x y',
    'javascript:alert(1)',
    '//www.mercadopago.com.br/x',
    '',
    null,
    42,
    'https://www.mercadopago.com.br/' + 'a'.repeat(700),
  ])('recusa %j', (url) => expect(isMercadoPagoUrl(url)).toBe(false))
})

describe('createPreference', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  const order = {
    orderId: ORDER,
    items: [
      { courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 3299 },
      { courseId: 'design', title: 'Design Gráfico', priceCents: 4990 },
    ],
  }

  test('manda a foto do pedido (preços do banco), a referência e as URLs do site, sem dados pessoais', async () => {
    fetchMock.mockResolvedValue(json({ id: '123-abc', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123-abc', sandbox_init_point: 'https://sandbox.mercadopago.com.br/x/y' }))
    const r = await createPreference(cfg, order, new Date('2026-11-02T12:00:00Z'))
    expect(r).toEqual({ preferenceId: '123-abc', checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123-abc' })

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/checkout/preferences')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN-SECRETO-DE-TESTE')
    expect(init.redirect).toBe('error')
    const body = JSON.parse(init.body as string)
    expect(body.items).toEqual([
      { id: 'mkt', title: 'Marketing Estratégico', quantity: 1, currency_id: 'BRL', unit_price: 32.99 },
      { id: 'design', title: 'Design Gráfico', quantity: 1, currency_id: 'BRL', unit_price: 49.9 },
    ])
    expect(body.external_reference).toBe(ORDER)
    expect(body.notification_url).toBe('https://www.usefolyo.com/api/webhooks/mercadopago')
    expect(body.back_urls).toEqual({
      success: `https://www.usefolyo.com/finalizar/retorno?pedido=${ORDER}`,
      pending: `https://www.usefolyo.com/finalizar/retorno?pedido=${ORDER}`,
      failure: `https://www.usefolyo.com/finalizar/retorno?pedido=${ORDER}`,
    })
    expect(body.payer).toBeUndefined()
    expect(body.expires).toBe(true)
    expect(body.expiration_date_from).toBe('2026-11-02T09:00:00.000-03:00')
    expect(body.expiration_date_to).toBe('2026-11-04T09:00:00.000-03:00')
  })

  test('com MERCADOPAGO_USE_SANDBOX_URL usa o link de teste', async () => {
    fetchMock.mockResolvedValue(json({ id: '9', init_point: 'https://www.mercadopago.com.br/a/b', sandbox_init_point: 'https://sandbox.mercadopago.com.br/a/b' }))
    const r = await createPreference({ ...cfg, useSandboxUrl: true }, order)
    expect(r.checkoutUrl).toBe('https://sandbox.mercadopago.com.br/a/b')
  })

  test('recusa link que não é do Mercado Pago (resposta adulterada)', async () => {
    fetchMock.mockResolvedValue(json({ id: '9', init_point: 'https://evil.com/mercadopago.com.br/' }))
    await expect(createPreference(cfg, order)).rejects.toBeInstanceOf(GatewayError)
  })

  test('erro HTTP vira GatewayError só com o status (sem token nem corpo)', async () => {
    fetchMock.mockResolvedValue(json({ message: 'TOKEN-SECRETO-DE-TESTE inválido' }, 401))
    const error = await createPreference(cfg, order).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).status).toBe(401)
    expect(String((error as GatewayError).message)).not.toContain('TOKEN')
  })

  test('falha de rede vira GatewayError sem os detalhes originais', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED com TOKEN-SECRETO-DE-TESTE'))
    const error = await createPreference(cfg, order).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).message).not.toContain('TOKEN')
  })

  test('id de preferência fora do formato é recusado', async () => {
    fetchMock.mockResolvedValue(json({ id: "x'; drop", init_point: 'https://www.mercadopago.com.br/a/b' }))
    await expect(createPreference(cfg, order)).rejects.toBeInstanceOf(GatewayError)
  })
})

describe('fetchPayment', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('lê status, valor em centavos, moeda e pedido da API (com o nosso token)', async () => {
    fetchMock.mockResolvedValue(json({ id: 123456789, status: 'approved', transaction_amount: 82.89, currency_id: 'BRL', external_reference: ORDER, payer: { email: 'x@y.z' } }))
    const r = await fetchPayment(cfg, '123456789')
    expect(r).toEqual({ kind: 'ok', payment: { id: '123456789', status: 'approved', amountCents: 8289, currency: 'BRL', externalReference: ORDER } })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/v1/payments/123456789')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN-SECRETO-DE-TESTE')
  })

  test.each([
    [0.1 + 0.2, 30],
    [19.99, 1999],
    [1234.5, 123450],
    [0, 0],
  ])('converte %s reais em %s centavos sem erro de arredondamento', async (amount, cents) => {
    fetchMock.mockResolvedValue(json({ id: 1, status: 'approved', transaction_amount: amount, currency_id: 'BRL', external_reference: ORDER }))
    const r = await fetchPayment(cfg, '1')
    expect(r.kind === 'ok' && r.payment.amountCents).toBe(cents)
  })

  test('404 = pagamento não existe (notificação de teste)', async () => {
    fetchMock.mockResolvedValue(json({ message: 'not found' }, 404))
    expect(await fetchPayment(cfg, '123')).toEqual({ kind: 'not_found' })
  })

  test('outros erros lançam (o webhook responde erro e o Mercado Pago reenvia)', async () => {
    for (const status of [401, 429, 500, 503]) {
      fetchMock.mockResolvedValue(json({}, status))
      await expect(fetchPayment(cfg, '123')).rejects.toBeInstanceOf(GatewayError)
    }
  })

  test('resposta de outro pagamento (id diferente) ou fora do formato é recusada', async () => {
    fetchMock.mockResolvedValue(json({ id: 999, status: 'approved', transaction_amount: 1, currency_id: 'BRL', external_reference: ORDER }))
    await expect(fetchPayment(cfg, '123')).rejects.toBeInstanceOf(GatewayError)
    fetchMock.mockResolvedValue(json({ id: 123, status: 'APPROVED; x', transaction_amount: 1, currency_id: 'BRL' }))
    await expect(fetchPayment(cfg, '123')).rejects.toBeInstanceOf(GatewayError)
    fetchMock.mockResolvedValue(json({ id: 123, status: 'approved', transaction_amount: 'muito', currency_id: 'BRL' }))
    await expect(fetchPayment(cfg, '123')).rejects.toBeInstanceOf(GatewayError)
  })

  test('id que não é número nunca chega a ir para a API (nada de ../ na URL)', async () => {
    for (const id of ['', 'abc', '../admin', '12 3', '1'.repeat(30)]) await expect(fetchPayment(cfg, id)).rejects.toBeInstanceOf(GatewayError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('sem referência de pedido volta null', async () => {
    fetchMock.mockResolvedValue(json({ id: 5, status: 'pending', transaction_amount: 10, currency_id: 'BRL' }))
    const r = await fetchPayment(cfg, '5')
    expect(r.kind === 'ok' && r.payment.externalReference).toBeNull()
  })
})
