import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildOrderBody,
  checkoutConfig,
  createGatewayOrder,
  fetchGatewayOrder,
  fromCents,
  GatewayError,
  allocateItems,
  parseGatewayOrder,
  splitName,
  toCents,
  webhookConfig,
  type MercadoPagoConfig,
  type NewGatewayOrder,
} from '@/lib/payments/mercadopago'
import { isMercadoPagoUrl } from '@/lib/payments/order'

const cfg: MercadoPagoConfig = { accessToken: 'TOKEN-SECRETO-DE-TESTE', webhookSecret: 'x', publicKey: 'APP_USR-abc12345-test' }
const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const ATTEMPT = '9a8b7c6d-1111-4222-8333-444455556666'
const PIX_CODE = '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5909Folyo6009SAO PAULO62070503***6304ABCD'

/** Cada chamada recebe uma cópia nova da resposta (um corpo só pode ser lido uma vez, e o SDK e a releitura leem). */
const always = (mock: { mockImplementation: (fn: () => Promise<Response>) => unknown }, response: Response) => mock.mockImplementation(async () => response.clone())

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const card: NewGatewayOrder = {
  orderId: ORDER,
  attemptId: ATTEMPT,
  totalCents: 8289,
  email: 'ana@exemplo.com',
  cpf: '52998224725',
  description: 'Folyo: 2 cursos',
  items: [
    { courseId: 'c-um', title: 'Excel do zero', priceCents: 4990 },
    { courseId: 'c-dois', title: 'Power BI', priceCents: 3299 },
  ],
  payerName: 'Ana Maria Souza',
  deviceId: 'device-abc-12345',
  payment: { kind: 'card', token: 'ff8080814c11e237014c1ff593b57b4d', paymentMethodId: 'visa', installments: 3 },
}
const pix: NewGatewayOrder = { ...card, payment: { kind: 'pix' } }

const mpOrder = (over: Record<string, unknown> = {}) => ({
  id: 'ORD01TESTE',
  status: 'processed',
  status_detail: 'accredited',
  external_reference: ORDER,
  total_amount: '82.89',
  currency: 'BRL',
  transactions: { payments: [{ id: 'PAY01TESTE', status: 'processed', status_detail: 'accredited', amount: '82.89', paid_amount: '82.89' }] },
  ...over,
})

describe('isMercadoPagoUrl', () => {
  test.each([
    'https://www.mercadopago.com.br/payments/123/ticket?caller_id=1&hash=abc',
    'https://sandbox.mercadopago.com.br/x',
    'https://mercadopago.com/checkout',
    'https://www.mercadopago.com/mlb/x?y=1',
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

describe('configuração', () => {
  afterEach(() => vi.unstubAllEnvs())
  const env = (over: Record<string, string> = {}) => {
    vi.stubEnv('PAYMENTS_ENABLED', 'true')
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TOKEN')
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo')
    vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-abc12345-test')
    for (const [k, v] of Object.entries(over)) vi.stubEnv(k, v)
  }

  test('a venda só liga com PAYMENTS_ENABLED=true E token, chave do webhook e chave pública', () => {
    env()
    expect(checkoutConfig()).toMatchObject({ accessToken: 'TOKEN', publicKey: 'APP_USR-abc12345-test' })
    for (const off of ['false', '', 'TRUE', '1']) {
      env({ PAYMENTS_ENABLED: off })
      expect(checkoutConfig(), off).toBeNull()
    }
    env({ MERCADOPAGO_ACCESS_TOKEN: '' })
    expect(checkoutConfig()).toBeNull()
    env({ MERCADOPAGO_WEBHOOK_SECRET: '' })
    expect(checkoutConfig()).toBeNull()
    env({ MERCADOPAGO_PUBLIC_KEY: '' })
    expect(checkoutConfig()).toBeNull()
  })

  test('chave pública fora do formato (ou um token por engano) não vale', () => {
    for (const bad of ['TOKEN', 'APP_USR-', 'APP_USR-abc 123456', 'http://x', 'APP_USR-<script>alert(1)</script>']) {
      env({ MERCADOPAGO_PUBLIC_KEY: bad })
      expect(checkoutConfig(), bad).toBeNull()
    }
    env({ MERCADOPAGO_PUBLIC_KEY: 'TEST-8f2c1d9e-1234-4abc-9def-0123456789ab' })
    expect(checkoutConfig()).not.toBeNull()
  })

  test('o webhook funciona com a venda desligada e sem a chave pública', () => {
    env({ PAYMENTS_ENABLED: 'false', MERCADOPAGO_PUBLIC_KEY: '' })
    expect(webhookConfig()).toMatchObject({ accessToken: 'TOKEN', webhookSecret: 'segredo', publicKey: null })
    env({ MERCADOPAGO_WEBHOOK_SECRET: '' })
    expect(webhookConfig()).toBeNull()
  })
})

describe('valores', () => {
  test.each([
    ['82.89', 8289],
    ['50.00', 5000],
    ['50', 5000],
    ['0.5', 50],
    ['0.05', 5],
    [82.89, 8289],
    ['1234567.01', 123456701],
  ])('toCents(%j) = %i', (input, cents) => expect(toCents(input)).toBe(cents))

  test.each(['', 'abc', '-1.00', '1.005', '1,50', '1e3', '12345678901', null, undefined, {}, NaN])('toCents recusa %j', (input) => expect(toCents(input)).toBeNull())

  test.each([
    [8289, '82.89'],
    [5000, '50.00'],
    [5, '0.05'],
    [100000000, '1000000.00'],
  ])('fromCents(%i) = %s', (cents, text) => expect(fromCents(cents)).toBe(text))

  test('fromCents recusa o que não é centavo inteiro', () => {
    for (const bad of [-1, 1.5, NaN, Infinity]) expect(() => fromCents(bad)).toThrow(GatewayError)
  })
})

describe('buildOrderBody', () => {
  test('cartão: o valor, a referência e o CPF vão certos; só o token do cartão, nada de número, validade ou código', () => {
    const body = buildOrderBody(card) as Record<string, unknown>
    expect(body).toMatchObject({
      type: 'online',
      processing_mode: 'automatic',
      total_amount: '82.89',
      external_reference: ORDER,
      payer: { email: 'ana@exemplo.com', first_name: 'Ana', last_name: 'Maria Souza', identification: { type: 'CPF', number: '52998224725' } },
      items: [
        { title: 'Excel do zero', unit_price: '49.90', quantity: 1, category_id: 'learnings' },
        { title: 'Power BI', unit_price: '32.99', quantity: 1, category_id: 'learnings' },
      ],
      config: { payment_method: { max_installments: 12 }, online: { transaction_security: { validation: 'on_fraud_risk', liability_shift: 'required' } } },
      transactions: {
        payments: [{ amount: '82.89', payment_method: { id: 'visa', type: 'credit_card', token: 'ff8080814c11e237014c1ff593b57b4d', installments: 3, statement_descriptor: 'FOLYO' } }],
      },
    })
    const text = JSON.stringify(body)
    expect(text).not.toMatch(/card_number|cardNumber|security_code|expiration_month|expiration_year|cvv/i)
  })

  test('Pix: forma bank_transfer com validade de 1 hora e sem dados de cartão', () => {
    const body = buildOrderBody(pix) as { transactions: { payments: Record<string, unknown>[] }; config?: unknown }
    expect(body.transactions.payments).toEqual([{ amount: '82.89', expiration_time: 'PT60M', payment_method: { id: 'pix', type: 'bank_transfer' } }])
    expect(body.config).toBeUndefined()
  })

  test('o valor da ordem e o do pagamento são sempre o mesmo (o total do pedido no banco)', () => {
    for (const input of [card, pix]) {
      const body = buildOrderBody({ ...input, totalCents: 3299 }) as { total_amount: string; transactions: { payments: { amount: string }[] } }
      expect(body.total_amount).toBe('32.99')
      expect(body.transactions.payments[0].amount).toBe('32.99')
    }
  })
})

describe('itens, comprador e fatura (qualidade da integração do Mercado Pago)', () => {
  type Body = {
    items: { title: string; unit_price: string; quantity: number; category_id: string }[]
    payer: Record<string, unknown>
    additional_info?: unknown
    config?: Record<string, unknown>
    transactions: { payments: { payment_method: Record<string, unknown> }[] }
  }

  test('o descritivo da fatura vai DENTRO do pagamento (não solto em config) e só no cartão', () => {
    const body = buildOrderBody(card) as Body
    expect(body.transactions.payments[0].payment_method.statement_descriptor).toBe('FOLYO')
    expect(body.config).not.toHaveProperty('statement_descriptor')
    expect(JSON.stringify(buildOrderBody(pix))).not.toContain('statement_descriptor')
  })

  test('cada curso vira um item com quantidade 1, preço e categoria; Pix leva os mesmos itens', () => {
    for (const input of [card, pix]) {
      const body = buildOrderBody(input) as Body
      expect(body.items).toHaveLength(2)
      for (const item of body.items) expect(item).toMatchObject({ quantity: 1, category_id: 'learnings' })
    }
  })

  test('com cupom, os itens somam exatamente o total cobrado', () => {
    const body = buildOrderBody({ ...card, totalCents: 7000 }) as Body
    const sum = body.items.reduce((acc, item) => acc + Number(item.unit_price.replace('.', '')), 0)
    expect(sum).toBe(7000)
    expect(body.items.every((item) => Number(item.unit_price) > 0)).toBe(true)
  })

  test('a ordem não leva `additional_info` (a API de Orders não aceita esse nó: dá unsupported_properties)', () => {
    for (const input of [card, pix]) expect(JSON.stringify(buildOrderBody(input))).not.toContain('additional_info')
  })

  test('sem nome, os campos de nome simplesmente não vão', () => {
    const body = buildOrderBody({ ...card, payerName: null }) as Body
    expect(body.payer).toEqual({ email: 'ana@exemplo.com', identification: { type: 'CPF', number: '52998224725' } })
  })

  test('sem itens utilizáveis, vai um item só com o total', () => {
    const body = buildOrderBody({ ...card, items: [] }) as Body
    expect(body.items).toEqual([{ title: 'Folyo: 2 cursos', unit_price: '82.89', quantity: 1, category_id: 'learnings' }])
  })
})

describe('allocateItems', () => {
  const two = [
    { courseId: 'a', title: 'A', priceCents: 4990 },
    { courseId: 'b', title: 'B', priceCents: 3299 },
  ]
  test('sem desconto, preço de tabela', () => {
    expect(allocateItems(two, 8289)).toEqual([
      { title: 'A', cents: 4990 },
      { title: 'B', cents: 3299 },
    ])
  })
  test.each([8000, 8288, 4000, 1234, 2])('com desconto (total %i), a soma é exatamente o total', (total) => {
    const result = allocateItems(two, total)
    if (result === null) return
    expect(result.reduce((acc, item) => acc + item.cents, 0)).toBe(total)
    expect(result.every((item) => item.cents >= 1)).toBe(true)
  })
  test('total menor que o número de itens não dá para repartir', () => {
    expect(allocateItems(two, 1)).toBeNull()
    expect(allocateItems([], 100)).toBeNull()
  })
})

describe('splitName', () => {
  test.each([
    ['Ana Maria Souza', { firstName: 'Ana', lastName: 'Maria Souza' }],
    ['  João   da  Silva ', { firstName: 'João', lastName: 'da Silva' }],
    ['Beyoncé', { firstName: 'Beyoncé' }],
    ["D'Ávila-Neto Jr.", { firstName: "D'Ávila-Neto", lastName: 'Jr.' }],
    ['Ana <script>1</script> 123', { firstName: 'Ana', lastName: 'script script' }],
    ['', {}],
    ['1234 !!!', {}],
    [null, {}],
    [undefined, {}],
  ])('splitName(%j)', (input, expected) => expect(splitName(input as string | null | undefined)).toEqual(expected))
})

describe('createGatewayOrder', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('POST /v1/orders com o token, a chave de idempotência e o id do dispositivo', async () => {
    always(fetchMock, json(mpOrder(), 201))
    const order = await createGatewayOrder(cfg, card)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/v1/orders')
    expect(init.method).toBe('POST')
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer TOKEN-SECRETO-DE-TESTE')
    expect(headers.get('X-Idempotency-Key')).toBe(ATTEMPT)
    expect(headers.get('X-meli-session-id')).toBe('device-abc-12345')
    expect(headers.get('Content-Type')).toBe('application/json')
    // O SDK oficial se identifica (é o que o Mercado Pago mede na qualidade da integração).
    expect(headers.get('User-Agent')).toMatch(/^MercadoPago Node\.js SDK v/)
    expect(headers.get('X-Tracking-Id')).toMatch(/type:SDK/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(init.body as string).total_amount).toBe('82.89')
    expect(order).toMatchObject({ id: 'ORD01TESTE', status: 'processed', statusDetail: 'accredited', externalReference: ORDER, totalCents: 8289, currency: 'BRL', paymentCount: 1 })
    expect(order.payment).toMatchObject({ id: 'PAY01TESTE', amountCents: 8289 })
  })

  test('sem id do dispositivo, o cabeçalho não vai', async () => {
    always(fetchMock, json(mpOrder(), 201))
    await createGatewayOrder(cfg, { ...card, deviceId: undefined })
    expect(new Headers((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).has('X-meli-session-id')).toBe(false)
  })

  test('pagamento recusado com erro HTTP, mas com a ordem no corpo, volta como ordem (não como falha)', async () => {
    always(fetchMock, json(mpOrder({ status: 'failed', status_detail: 'rejected_by_issuer' }), 402))
    const order = await createGatewayOrder(cfg, card)
    expect(order).toMatchObject({ status: 'failed', statusDetail: 'rejected_by_issuer' })
  })

  test('402 com a ordem em `data` e o motivo em errors[].details: volta como ordem recusada, com o motivo', async () => {
    const failed = mpOrder({ status: 'failed', status_detail: 'failed', transactions: { payments: [{ id: 'PAY01TESTE', status: 'failed', amount: '82.89' }] } })
    always(fetchMock, 
      json({ errors: [{ code: 'failed', message: 'The following transactions failed', details: ['PAY01TESTE: rejected_by_issuer'] }], data: failed }, 402),
    )
    const order = await createGatewayOrder(cfg, card)
    expect(order).toMatchObject({ status: 'failed', payment: { id: 'PAY01TESTE', statusDetail: 'rejected_by_issuer' } })
  })

  test('402 com `data` de OUTRO pedido nunca é aceito', async () => {
    always(fetchMock, json({ errors: [{ code: 'failed' }], data: mpOrder({ external_reference: '00000000-0000-4000-8000-000000000000' }) }, 402))
    await expect(createGatewayOrder(cfg, card)).rejects.toMatchObject({ status: 402, code: 'failed' })
  })

  test('ordem de OUTRO pedido em resposta de erro nunca é aceita', async () => {
    always(fetchMock, json(mpOrder({ external_reference: '00000000-0000-4000-8000-000000000000' }), 402))
    await expect(createGatewayOrder(cfg, card)).rejects.toMatchObject({ status: 402 })
  })

  test('erro sem ordem vira GatewayError só com o status e o código (sem token nem corpo)', async () => {
    always(fetchMock, json({ errors: [{ code: 'invalid_card_token', message: 'Token TOKEN-SECRETO-DE-TESTE inválido', details: ['cpf 52998224725'] }] }, 400))
    const error = await createGatewayOrder(cfg, card).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect(error).toMatchObject({ status: 400, code: 'invalid_card_token' })
    expect(JSON.stringify(error)).not.toContain('TOKEN-SECRETO-DE-TESTE')
    expect(String((error as Error).message)).not.toMatch(/TOKEN|5299/)
  })

  test('unsupported_properties: o erro leva os nomes dos campos recusados (para o log), nunca dados da pessoa', async () => {
    always(fetchMock, json({ errors: [{ code: 'unsupported_properties', details: ['items.0.foo', 'payer.cpf 52998224725', 'x'.repeat(200), 'additional_info'] }] }, 400))
    const error = await createGatewayOrder(cfg, card).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 400, code: 'unsupported_properties', detail: 'items.0.foo | additional_info' })
  })

  test('código de erro fora do formato é descartado', async () => {
    always(fetchMock, json({ errors: [{ code: '<script>alert(1)</script>' }] }, 400))
    await expect(createGatewayOrder(cfg, card)).rejects.toMatchObject({ status: 400, code: undefined })
  })

  test('falha de rede ou tempo esgotado vira GatewayError sem os detalhes originais e sem status', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED com TOKEN-SECRETO-DE-TESTE'))
    const error = await createGatewayOrder(cfg, card).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).status).toBeUndefined()
    expect(String((error as Error).message)).not.toContain('ECONNREFUSED')
  })

  test('recusa 4xx: o SDK perde o corpo, então ele é lido de novo com a MESMA chave de idempotência', async () => {
    always(fetchMock, json({ errors: [{ code: 'failed', details: ['PAY01TESTE: rejected_by_issuer'] }], data: mpOrder({ status: 'failed', status_detail: 'failed' }) }, 402))
    await createGatewayOrder(cfg, card)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const keys = fetchMock.mock.calls.map((c) => new Headers((c as [string, RequestInit])[1].headers).get('X-Idempotency-Key'))
    expect(keys).toEqual([ATTEMPT, ATTEMPT])
  })

  test('erro do servidor (5xx) ou "tente depois" (409/423/429): sem releitura e sem tentativas automáticas', async () => {
    for (const status of [500, 503, 409, 423, 429]) {
      fetchMock.mockReset()
      always(fetchMock, json({}, status))
      await expect(createGatewayOrder(cfg, card)).rejects.toMatchObject({ status })
      expect(fetchMock, String(status)).toHaveBeenCalledTimes(1)
    }
  })

  test('se a releitura falhar, vale o status do primeiro erro (a recusa continua sendo recusa)', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 402)).mockRejectedValueOnce(new Error('rede'))
    await expect(createGatewayOrder(cfg, card)).rejects.toMatchObject({ status: 402 })
  })

  test('resposta 200 que não é uma ordem: recusada', async () => {
    always(fetchMock, json({ ok: true }, 200))
    await expect(createGatewayOrder(cfg, card)).rejects.toBeInstanceOf(GatewayError)
    always(fetchMock, new Response('<html>', { status: 200 }))
    await expect(createGatewayOrder(cfg, card)).rejects.toBeInstanceOf(GatewayError)
  })
})

describe('fetchGatewayOrder', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  test('lê a ordem da API com o nosso token', async () => {
    always(fetchMock, json(mpOrder()))
    const lookup = await fetchGatewayOrder(cfg, 'ORD01TESTE')
    expect(lookup.kind).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/v1/orders/ORD01TESTE')
    expect(init.method).toBe('GET')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer TOKEN-SECRETO-DE-TESTE')
    expect(new Headers(init.headers).get('User-Agent')).toMatch(/^MercadoPago Node\.js SDK v/)
  })

  test('404 = ordem não existe (notificação de teste)', async () => {
    always(fetchMock, json({}, 404))
    expect(await fetchGatewayOrder(cfg, 'ORD01TESTE')).toEqual({ kind: 'not_found' })
  })

  test('400 = id que o Mercado Pago não reconhece (notificação de teste do painel): ordem inexistente', async () => {
    always(fetchMock, json({ errors: [{ code: 'invalid_id' }] }, 400))
    expect(await fetchGatewayOrder(cfg, 'ORD01TESTE')).toEqual({ kind: 'not_found' })
  })

  test('outros erros lançam (o webhook responde erro e o Mercado Pago reenvia)', async () => {
    always(fetchMock, json({}, 503))
    await expect(fetchGatewayOrder(cfg, 'ORD01TESTE')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValue(new Error('rede'))
    await expect(fetchGatewayOrder(cfg, 'ORD01TESTE')).rejects.toBeInstanceOf(GatewayError)
  })

  test('resposta de outra ordem (id diferente) ou fora do formato é recusada', async () => {
    always(fetchMock, json(mpOrder({ id: 'ORDOUTRA' })))
    await expect(fetchGatewayOrder(cfg, 'ORD01TESTE')).rejects.toBeInstanceOf(GatewayError)
    always(fetchMock, json({ id: 'ORD01TESTE' }))
    await expect(fetchGatewayOrder(cfg, 'ORD01TESTE')).rejects.toBeInstanceOf(GatewayError)
  })

  test.each(['', '../x', 'a b', 'ORD/../../v1/payments', 'x'.repeat(65), 'ORD?x=1'])('id %j nunca chega a ir para a API', async (id) => {
    await expect(fetchGatewayOrder(cfg, id)).rejects.toBeInstanceOf(GatewayError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('parseGatewayOrder', () => {
  const withPayment = (payment: Record<string, unknown>) => parseGatewayOrder(mpOrder({ transactions: { payments: [{ id: 'PAY1', ...payment }] } }))

  test('Pix: código, QR e link do Mercado Pago; o que o banco recusaria vira null', () => {
    const good = withPayment({
      status: 'action_required',
      status_detail: 'waiting_transfer',
      date_of_expiration: '2026-11-02T16:00:00.000-03:00',
      payment_method: { qr_code: PIX_CODE, qr_code_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAE=', ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket?hash=a' },
    })!
    expect(good.payment?.pix).toEqual({ code: PIX_CODE, qrBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAE=', ticketUrl: 'https://www.mercadopago.com.br/payments/1/ticket?hash=a' })
    expect(good.payment?.expiresAt).toBe('2026-11-02T16:00:00.000-03:00')

    const bad = withPayment({ payment_method: { qr_code: PIX_CODE, qr_code_base64: '<img src=x onerror=alert(1)>', ticket_url: 'https://evil.example/ticket' } })!
    expect(bad.payment?.pix).toEqual({ code: PIX_CODE, qrBase64: null, ticketUrl: null })
    expect(withPayment({ payment_method: { qr_code: 'curto' } })!.payment?.pix).toBeNull()
    expect(withPayment({ payment_method: { qr_code: `${PIX_CODE}\n<script>` } })!.payment?.pix).toBeNull()
  })

  test('3D Secure: só endereço https', () => {
    const url = (u: string) => withPayment({ payment_method: { transaction_security: { url: u, status: 'pending' } } })!.payment?.threeDsUrl
    expect(url('https://www.mercadopago.com.br/3ds/abc')).toBe('https://www.mercadopago.com.br/3ds/abc')
    expect(url('http://www.mercadopago.com.br/3ds')).toBeNull()
    expect(url('javascript:alert(1)')).toBeNull()
    expect(url('https://x.example/a b')).toBeNull()
  })

  test('valores em texto ou número viram centavos; sem valor, null', () => {
    expect(withPayment({ amount: '50.00' })!.payment?.amountCents).toBe(5000)
    expect(withPayment({ amount: 50 })!.payment?.amountCents).toBe(5000)
    expect(withPayment({ amount: 'abc' })!.payment?.amountCents).toBeNull()
    expect(withPayment({})!.payment?.amountCents).toBeNull()
  })

  test('sem moeda na resposta é real; outra moeda segue como veio', () => {
    expect(parseGatewayOrder(mpOrder({ currency: undefined }))!.currency).toBe('BRL')
    expect(parseGatewayOrder(mpOrder({ currency: 'USD' }))!.currency).toBe('USD')
  })

  test('conta os pagamentos da ordem', () => {
    expect(parseGatewayOrder(mpOrder({ transactions: { payments: [] } }))).toMatchObject({ paymentCount: 0, payment: null })
    const two = parseGatewayOrder(mpOrder({ transactions: { payments: [{ id: 'A' }, { id: 'B' }] } }))!
    expect(two.paymentCount).toBe(2)
    expect(two.payment?.id).toBe('A')
  })

  test.each([null, undefined, 'texto', 42, [], {}, { id: 'ORD1' }, { id: '../x', status: 'processed' }, { id: 'ORD1', status: 'processed', status_detail: 'a b' }])(
    'recusa %j',
    (body) => expect(parseGatewayOrder(body)).toBeNull(),
  )
})
