import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Ações de pagamento dentro do site (Checkout Transparente) com o banco e o Mercado Pago simulados.
 * O que se garante: o navegador só manda ids, CPF e o token do cartão (valor enviado por ele é ignorado), o valor cobrado
 * é o do banco, a venda só abre ligada no servidor, mensagens do banco só passam se forem as conhecidas, o aluno só é
 * levado para endereços do Mercado Pago, e nem CPF, token nem chaves aparecem no log ou na resposta.
 */

const userRpc = vi.fn()
const serviceRpc = vi.fn()
let session: { user: { id: string }; supabase: { rpc: typeof userRpc } } | null = null
vi.mock('@/lib/actions/shared', () => ({ actionContext: async () => session }))
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ rpc: serviceRpc }) }))
const receipts = vi.fn(async () => {})
vi.mock('@/lib/email/send', () => ({ sendOrderReceipt: (...args: unknown[]) => receipts(...(args as [])) }))
const afterCallbacks: Array<() => Promise<void> | void> = []
vi.mock('next/server', () => ({ after: (fn: () => Promise<void> | void) => afterCallbacks.push(fn) }))

import { checkPaymentAction, orderStatusAction, payOrderAction, startCheckoutAction } from '@/lib/actions/checkout'

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const ATTEMPT = '9a8b7c6d-1111-4222-8333-444455556666'
const CPF = '529.982.247-25'
const TOKEN = 'ff8080814c11e237014c1ff593b57b4d'
const TOKEN_ENV = 'TOKEN-SECRETO-DE-TESTE'
const THREE_DS = 'https://www.mercadopago.com.br/3ds/challenge?token=SEGREDO-3DS'
const PIX_CODE = '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5909Folyo6009SAO PAULO62070503***6304ABCD'
const QR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk'
const ITEMS = [
  { courseId: 'mkt', title: 'Marketing', priceCents: 3299 },
  { courseId: 'design', title: 'Design', priceCents: 4990 },
]
let n = 0
const newUser = () => ({ user: { id: 'user-' + ++n }, supabase: { rpc: userRpc } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const FAIL_TEXT = 'Não foi possível iniciar o pagamento'

const created = (over: Record<string, unknown> = {}) => ({ data: { orderId: ORDER, totalCents: 8289, items: ITEMS, ...over }, error: null })
const begun = (over: Record<string, unknown> = {}) => ({
  data: { reused: false, attemptId: ATTEMPT, orderId: ORDER, totalCents: 8289, installments: 1, email: 'ana@exemplo.com', items: ITEMS, ...over },
  error: null,
})
const gw = (status: string, detail: string, paymentExtra: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
  id: 'ORD01TESTE',
  status,
  status_detail: detail,
  external_reference: ORDER,
  total_amount: '82.89',
  currency: 'BRL',
  transactions: { payments: [{ id: 'PAY01TESTE', status, status_detail: detail, amount: '82.89', ...paymentExtra }] },
  ...over,
})
const card = { method: 'cartao', orderId: ORDER, token: TOKEN, paymentMethodId: 'visa', installments: 3, cpf: CPF, deviceId: 'device-abc-12345' }
const pix = { method: 'pix', orderId: ORDER, cpf: CPF }

let fetchMock: ReturnType<typeof vi.fn>
let logs: string[]
function env() {
  vi.stubEnv('PAYMENTS_ENABLED', 'true')
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', TOKEN_ENV)
  vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-do-webhook')
  vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-abc12345-test')
}
function setup() {
  env()
  session = newUser()
  userRpc.mockReset()
  serviceRpc.mockReset()
  serviceRpc.mockImplementation(async (fn: string) => {
    if (fn === 'record_payment_attempt') return { data: null, error: null }
    if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
    if (fn === 'apply_payment') return { data: { result: 'liberado' }, error: null }
    return { data: null, error: null }
  })
  receipts.mockClear()
  afterCallbacks.length = 0
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  logs = []
  for (const level of ['error', 'warn', 'info', 'log'] as const) vi.spyOn(console, level).mockImplementation((...a: unknown[]) => void logs.push(JSON.stringify(a)))
}
function teardown() {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
}
const recorded = () => serviceRpc.mock.calls.filter(([fn]) => fn === 'record_payment_attempt').map(([, args]) => args as Record<string, unknown>)
const noSecretsLeaked = (...texts: string[]) => {
  for (const t of [...texts, ...logs]) for (const secret of ['529.982.247-25', '52998224725', TOKEN, TOKEN_ENV, 'segredo-do-webhook', 'SEGREDO-3DS'])
    expect(t, secret).not.toContain(secret)
}

describe('startCheckoutAction', () => {
  beforeEach(setup)
  afterEach(teardown)

  test('cria o pedido só com ids e devolve o id; nada é chamado no Mercado Pago ainda', async () => {
    userRpc.mockResolvedValueOnce(created())
    expect(await startCheckoutAction({ courseIds: ['mkt', 'design'] })).toEqual({ ok: true, orderId: ORDER })
    expect(userRpc).toHaveBeenCalledTimes(1)
    expect(userRpc).toHaveBeenCalledWith('create_order', { p_course_ids: ['mkt', 'design'] })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('preço, total ou título enviados pelo navegador são ignorados', async () => {
    userRpc.mockResolvedValueOnce(created())
    const r = await startCheckoutAction({ courseIds: ['mkt'], priceCents: 1, totalCents: 1, items: [{ price: 0.01 }] })
    expect(r.ok).toBe(true)
    expect(userRpc.mock.calls[0]).toEqual(['create_order', { p_course_ids: ['mkt'] }])
  })

  test('venda desligada ou sem chaves no servidor: não cria pedido', async () => {
    for (const off of ['false', '', 'TRUE']) {
      vi.stubEnv('PAYMENTS_ENABLED', off)
      expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'O pagamento online ainda não está disponível.' })
    }
    vi.stubEnv('PAYMENTS_ENABLED', 'true')
    for (const key of ['MERCADOPAGO_ACCESS_TOKEN', 'MERCADOPAGO_WEBHOOK_SECRET', 'MERCADOPAGO_PUBLIC_KEY']) {
      env()
      vi.stubEnv(key, '')
      expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok, key).toBe(false)
    }
    expect(userRpc).not.toHaveBeenCalled()
  })

  test.each([[undefined], [null], [{}], [{ courseIds: [] }], [{ courseIds: ['MAIÚSCULA'] }], [{ courseIds: ["a'; drop"] }], [{ courseIds: 'mkt' }], [{ courseIds: Array(60).fill('mkt') }]])(
    'entrada inválida %j é recusada sem tocar no banco',
    async (input) => {
      expect((await startCheckoutAction(input)).ok).toBe(false)
      expect(userRpc).not.toHaveBeenCalled()
    },
  )

  test('sem sessão: pede para entrar de novo', async () => {
    session = null
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' })
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('limite de pedidos por minuto, por conta', async () => {
    userRpc.mockResolvedValue(created())
    const results = []
    for (let i = 0; i < 10; i++) results.push(await startCheckoutAction({ courseIds: ['mkt'] }))
    expect(results.filter((r) => r.ok)).toHaveLength(8)
    expect(results[9]).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
    session = newUser()
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(true)
  })

  test('mensagem conhecida do banco vai para a tela; qualquer outra vira a genérica', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'Nenhum curso do carrinho está à venda.' } })
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Nenhum curso do carrinho está à venda.' })
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'relation "private.orders" does not exist' } })
    const r = await startCheckoutAction({ courseIds: ['mkt'] })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('private.orders')
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FY429', message: 'limite' } })
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
  })

  test('resposta estranha do banco: erro genérico', async () => {
    userRpc.mockResolvedValueOnce({ data: { orderId: 'não-é-uuid' }, error: null })
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)
  })
})

describe('payOrderAction: validação e limites', () => {
  beforeEach(setup)
  afterEach(teardown)

  test.each([
    [undefined],
    [{}],
    [{ ...card, cpf: '111.111.111-11' }],
    [{ ...card, installments: 13 }],
    [{ ...card, token: '<script>' }],
    [{ ...card, method: 'boleto' }],
    [{ ...pix, orderId: 'abc' }],
  ])('formulário inválido %j não chega ao banco nem ao Mercado Pago', async (input) => {
    const r = await payOrderAction(input)
    expect(r.ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('venda desligada: nada é chamado', async () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'false')
    expect(await payOrderAction(card)).toEqual({ ok: false, error: 'O pagamento online ainda não está disponível.' })
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('sem sessão: pede para entrar de novo', async () => {
    session = null
    expect(await payOrderAction(card)).toEqual({ ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' })
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('limite de pagamentos por minuto, por conta', async () => {
    userRpc.mockResolvedValue({ data: null, error: { code: 'FC422', message: 'Este pedido já foi pago.' } })
    const results = []
    for (let i = 0; i < 8; i++) results.push(await payOrderAction(card))
    expect(results.slice(0, 6).every((r) => !r.ok && r.error === 'Este pedido já foi pago.')).toBe(true)
    expect(results[7]).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
    expect(userRpc).toHaveBeenCalledTimes(6)
  })

  test('mensagens do banco: as conhecidas vão para a tela, as outras viram genérica, FY429 vira limite', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'Você atingiu o limite de tentativas com cartão neste pedido. Tente pagar com Pix ou fale com o suporte.' } })
    expect(await payOrderAction(card)).toMatchObject({ ok: false, error: expect.stringContaining('limite de tentativas com cartão') })
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'select * from private.orders' } })
    const r = await payOrderAction(card)
    expect(JSON.stringify(r)).not.toContain('private.orders')
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FY429', message: 'x' } })
    expect(await payOrderAction(card)).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('resposta do banco para outro pedido ou fora do formato: recusa e não chama o Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(begun({ orderId: '11111111-2222-4333-8444-555555555555' }))
    expect((await payOrderAction(card)).ok).toBe(false)
    userRpc.mockResolvedValueOnce({ data: { reused: false }, error: null })
    expect((await payOrderAction(card)).ok).toBe(false)
    userRpc.mockResolvedValueOnce(begun({ email: null }))
    expect((await payOrderAction(card)).ok).toBe(false)
    userRpc.mockResolvedValueOnce(begun({ items: [] }))
    expect((await payOrderAction(card)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('payOrderAction: cartão', () => {
  beforeEach(setup)
  afterEach(teardown)

  test('aprovado: cobra o VALOR DO BANCO, aplica o pagamento, manda o recibo e nunca vaza CPF/token', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('processed', 'accredited')))
    const r = await payOrderAction({ ...card, amount: 0.01, totalCents: 1, total_amount: '0.01', email: 'outro@x.com' })
    expect(r).toEqual({ ok: true, state: 'aprovado' })

    expect(userRpc).toHaveBeenCalledWith('begin_payment_attempt', { p_order: ORDER, p_method: 'cartao', p_installments: 3 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/v1/orders')
    const headers = init.headers as Record<string, string>
    expect(headers['X-Idempotency-Key']).toBe(ATTEMPT)
    const body = JSON.parse(init.body as string)
    expect(body.total_amount).toBe('82.89')
    expect(body.external_reference).toBe(ORDER)
    expect(body.payer.email).toBe('ana@exemplo.com')
    expect(JSON.stringify(body)).not.toContain('0.01')
    expect(body.transactions.payments[0].payment_method).toMatchObject({ token: TOKEN, installments: 3, type: 'credit_card' })

    expect(recorded()[0]).toMatchObject({ p_attempt: ATTEMPT, p_status: 'aprovado', p_provider_order_id: 'ORD01TESTE' })
    const names = serviceRpc.mock.calls.map(([fn]) => fn)
    expect(names).toEqual(['record_payment_attempt', 'settle_payment_attempt', 'apply_payment'])
    expect(serviceRpc.mock.calls[2][1]).toMatchObject({ p_order: ORDER, p_amount_cents: 8289, p_status: 'approved' })
    expect(afterCallbacks).toHaveLength(1)
    await afterCallbacks[0]()
    expect(receipts).toHaveBeenCalledWith(expect.anything(), ORDER)
    noSecretsLeaked(JSON.stringify(r))
  })

  test('aprovado, mas o banco falha ao aplicar: ainda responde aprovado (o aviso do Mercado Pago aplica depois)', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('processed', 'accredited')))
    serviceRpc.mockImplementation(async (fn: string) => (fn === 'settle_payment_attempt' ? { data: null, error: { code: '57014', message: 'x' } } : { data: null, error: null }))
    expect(await payOrderAction(card)).toEqual({ ok: true, state: 'aprovado' })
    expect(afterCallbacks).toHaveLength(0)
  })

  test('recusado: devolve o motivo em português e libera para tentar de novo', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('failed', 'failed', { status_detail: 'insufficient_amount' })))
    const r = await payOrderAction(card)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/limite/) })
    expect(recorded()[0]).toMatchObject({ p_status: 'recusado', p_open_minutes: 1 })
    expect(serviceRpc.mock.calls.map(([fn]) => fn)).not.toContain('apply_payment')
  })

  test('3D Secure: devolve o endereço do banco (do Mercado Pago) e segura o pedido por 15 minutos', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('action_required', 'pending_challenge', { payment_method: { transaction_security: { url: THREE_DS } } })))
    expect(await payOrderAction(card)).toEqual({ ok: true, state: 'aguardando_acao', threeDsUrl: THREE_DS })
    expect(recorded()[0]).toMatchObject({ p_status: 'aguardando_acao', p_open_minutes: 15 })
    noSecretsLeaked()
  })

  test('3D Secure com endereço de fora do Mercado Pago, ausente ou http: recusa e anota só o servidor', async () => {
    for (const url of ['https://evil.com/3ds?token=SEGREDO-3DS', 'http://www.mercadopago.com/3ds', null]) {
      userRpc.mockResolvedValueOnce(begun())
      fetchMock.mockResolvedValueOnce(json(gw('action_required', 'pending_challenge', url ? { payment_method: { transaction_security: { url } } } : {})))
      const r = await payOrderAction(card)
      expect(r.ok, String(url)).toBe(false)
      expect(JSON.stringify(r)).not.toContain('evil.com')
      session = newUser()
    }
    expect(logs.some((l) => l.includes('evil.com'))).toBe(true)
    expect(logs.join('')).not.toContain('SEGREDO-3DS')
  })

  test('em processamento: segura o pedido por 30 minutos e a tela espera', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('processing', 'processing')))
    expect(await payOrderAction(card)).toEqual({ ok: true, state: 'processando' })
    expect(recorded()[0]).toMatchObject({ p_status: 'processando', p_open_minutes: 30 })
  })

  test('Mercado Pago recusa os dados (4xx): nada foi cobrado, libera na hora e não vaza o token', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json({ errors: [{ code: 'invalid_card_token', message: `token ${TOKEN} inválido` }] }, 400))
    const r = await payOrderAction(card)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/cartão/) })
    expect(recorded()[0]).toMatchObject({ p_status: 'erro', p_open_minutes: 1 })
    noSecretsLeaked(JSON.stringify(r), JSON.stringify(recorded()))
  })

  test('erro 4xx desconhecido: mensagem genérica, código sem caracteres estranhos', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json({ errors: [{ code: 'qualquer_coisa', message: 'detalhe interno' }] }, 422))
    const r = await payOrderAction(card)
    expect(r).toEqual({ ok: false, error: expect.stringContaining(FAIL_TEXT) })
    expect(JSON.stringify(r)).not.toContain('detalhe interno')
  })

  test.each([
    ['5xx', () => json({ message: 'boom' }, 503)],
    ['rede caiu', () => Promise.reject(new TypeError('fetch failed'))],
    ['tempo esgotado (408)', () => json({}, 408)],
    ['muitas chamadas (429)', () => json({}, 429)],
  ])('falha incerta (%s): segura novos pagamentos por 3 minutos e avisa para aguardar', async (_name, answer) => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockImplementationOnce(async () => answer())
    const r = await payOrderAction(card)
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ error: expect.stringMatching(/confirm|aguard/i) })
    expect(recorded()[0]).toMatchObject({ p_status: 'processando', p_open_minutes: 3 })
    expect(recorded()[0].p_provider_order_id).toBeNull()
  })

  test('sem a chave secreta do Supabase no servidor: não chama o Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(begun())
    vi.resetModules()
    vi.doMock('@/lib/supabase/service', () => ({
      createSupabaseServiceClient: () => {
        throw new Error('sem chave')
      },
    }))
    const { payOrderAction: pay } = await import('@/lib/actions/checkout')
    expect(await pay(card)).toEqual({ ok: false, error: 'O pagamento online ainda não está disponível.' })
    expect(fetchMock).not.toHaveBeenCalled()
    vi.doUnmock('@/lib/supabase/service')
  })
})

describe('payOrderAction: Pix', () => {
  beforeEach(setup)
  afterEach(teardown)

  const pixOrder = (extra: Record<string, unknown> = {}) =>
    gw('action_required', 'waiting_transfer', {
      date_of_expiration: new Date(Date.now() + 60 * 60_000).toISOString(),
      payment_method: { id: 'pix', type: 'bank_transfer', qr_code: PIX_CODE, qr_code_base64: QR, ticket_url: 'https://www.mercadopago.com.br/payments/1/ticket?hash=abc' },
      ...extra,
    })

  test('gera o Pix, grava o código e devolve para a tela mostrar', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(pixOrder()))
    const r = await payOrderAction(pix)
    expect(r).toMatchObject({ ok: true, state: 'aguardando_pix', pix: { code: PIX_CODE, qrBase64: QR } })
    expect(userRpc).toHaveBeenCalledWith('begin_payment_attempt', { p_order: ORDER, p_method: 'pix', p_installments: 1 })
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.transactions.payments[0].payment_method).toMatchObject({ id: 'pix', type: 'bank_transfer' })
    expect(JSON.stringify(body)).not.toContain('token')
    const rec = recorded()[0]
    expect(rec).toMatchObject({ p_status: 'aguardando_pix', p_pix_code: PIX_CODE, p_pix_qr_base64: QR })
    expect(rec.p_open_minutes).toBeGreaterThanOrEqual(59)
    expect(rec.p_open_minutes).toBeLessThanOrEqual(60)
    noSecretsLeaked(JSON.stringify(rec.p_pix_ticket_url))
  })

  test('Pix já gerado e ainda válido: mostra o mesmo e NÃO chama o Mercado Pago', async () => {
    const reused = { code: PIX_CODE, qrBase64: QR, ticketUrl: null, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }
    userRpc.mockResolvedValueOnce({ data: { reused: true, attemptId: ATTEMPT, orderId: ORDER, totalCents: 8289, pix: reused }, error: null })
    expect(await payOrderAction(pix)).toEqual({ ok: true, state: 'aguardando_pix', pix: reused })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('Pix sem código na resposta: erro, libera na hora', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(gw('action_required', 'waiting_transfer', { payment_method: { id: 'pix' } })))
    expect((await payOrderAction(pix)).ok).toBe(false)
    expect(recorded()[0]).toMatchObject({ p_status: 'erro', p_status_detail: 'pix_sem_codigo', p_open_minutes: 1 })
  })

  test('Pix sem data de validade na resposta: assume 60 minutos', async () => {
    userRpc.mockResolvedValueOnce(begun())
    fetchMock.mockResolvedValueOnce(json(pixOrder({ date_of_expiration: undefined })))
    const r = await payOrderAction(pix)
    expect(r.ok).toBe(true)
    expect(recorded()[0].p_open_minutes).toBe(60)
  })
})

describe('orderStatusAction', () => {
  beforeEach(setup)
  afterEach(teardown)

  const status = (over: Record<string, unknown> = {}) => ({
    data: { status: 'pago', totalCents: 8289, paidAt: '2026-11-02T12:00:00Z', expiresAt: '2026-11-04T12:00:00Z', items: [{ courseId: 'mkt', title: 'Marketing', priceCents: 3299 }], attempt: null, ...over },
    error: null,
  })

  test('devolve o status do próprio pedido', async () => {
    userRpc.mockResolvedValueOnce(status())
    const r = await orderStatusAction(ORDER)
    expect(r).toMatchObject({ ok: true, order: { status: 'pago', totalCents: 8289 } })
    expect(userRpc).toHaveBeenCalledWith('order_status', { p_order: ORDER })
  })

  test('id que não é uuid não chega ao banco', async () => {
    for (const bad of [undefined, '', 'abc', "x'; drop", 42, null]) expect((await orderStatusAction(bad)).ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('pedido de outra conta (o banco devolve nulo) ou erro: falha sem detalhes', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await orderStatusAction(ORDER)).ok).toBe(false)
    userRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for table orders' } })
    expect(JSON.stringify(await orderStatusAction(ORDER))).not.toContain('orders')
  })

  test('sem sessão: pede para entrar de novo', async () => {
    session = null
    expect((await orderStatusAction(ORDER)).ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('limite por minuto, por conta', async () => {
    userRpc.mockResolvedValue(status())
    const results = []
    for (let i = 0; i < 62; i++) results.push(await orderStatusAction(ORDER))
    expect(results.filter((r) => r.ok)).toHaveLength(60)
  })
})

describe('checkPaymentAction ("conferir pagamento")', () => {
  beforeEach(setup)
  afterEach(teardown)

  const open = (over: Record<string, unknown> = {}) => ({
    data: {
      status: 'pendente',
      totalCents: 8289,
      paidAt: null,
      expiresAt: '2026-11-04T12:00:00Z',
      items: [{ courseId: 'mkt', title: 'Marketing', priceCents: 3299 }],
      attempt: { method: 'pix', status: 'aguardando_pix', statusDetail: 'waiting_transfer', open: true, pix: null },
      ...over,
    },
    error: null,
  })
  const paid = { data: { ...open().data, status: 'pago', paidAt: '2026-11-02T12:00:00Z', attempt: null }, error: null }

  test('pedido em aberto com pagamento em andamento: consulta o Mercado Pago, aplica e devolve o status novo', async () => {
    userRpc.mockResolvedValueOnce(open()).mockResolvedValueOnce(paid)
    serviceRpc.mockImplementation(async (fn: string) => {
      if (fn === 'payment_attempt_ref') return { data: { providerOrderId: 'ORD01TESTE', status: 'aguardando_pix' }, error: null }
      if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
      if (fn === 'apply_payment') return { data: { result: 'liberado' }, error: null }
      return { data: null, error: null }
    })
    fetchMock.mockResolvedValueOnce(json(gw('processed', 'accredited')))
    const r = await checkPaymentAction(ORDER)
    expect(r).toMatchObject({ ok: true, order: { status: 'pago' } })
    expect(serviceRpc).toHaveBeenCalledWith('payment_attempt_ref', { p_order: ORDER, p_user: session!.user.id })
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('https://api.mercadopago.com/v1/orders/ORD01TESTE')
    expect(serviceRpc.mock.calls.map(([fn]) => fn)).toContain('apply_payment')
    expect(afterCallbacks).toHaveLength(1)
  })

  test('pedido já pago, ou sem pagamento em aberto: só devolve o que o banco sabe, sem chamar o Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(paid)
    expect(await checkPaymentAction(ORDER)).toMatchObject({ ok: true, order: { status: 'pago' } })
    userRpc.mockResolvedValueOnce(open({ attempt: null }))
    expect((await checkPaymentAction(ORDER)).ok).toBe(true)
    userRpc.mockResolvedValueOnce(open({ attempt: { method: 'cartao', status: 'recusado', statusDetail: 'x', open: false, pix: null } }))
    expect((await checkPaymentAction(ORDER)).ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('pedido de outra conta: o banco devolve nulo e nada é consultado', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await checkPaymentAction(ORDER)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('Mercado Pago fora do ar: devolve o status que o banco já tem, sem erro para a tela', async () => {
    userRpc.mockResolvedValueOnce(open()).mockResolvedValueOnce(open())
    serviceRpc.mockResolvedValue({ data: { providerOrderId: 'ORD01TESTE', status: 'aguardando_pix' }, error: null })
    fetchMock.mockResolvedValueOnce(json({}, 503))
    expect(await checkPaymentAction(ORDER)).toMatchObject({ ok: true, order: { status: 'pendente' } })
  })

  test('referência estranha vinda do banco não vira consulta', async () => {
    userRpc.mockResolvedValueOnce(open()).mockResolvedValueOnce(open())
    serviceRpc.mockResolvedValue({ data: { providerOrderId: '../../x?y=1' }, error: null })
    await checkPaymentAction(ORDER)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('sem chaves do Mercado Pago, sem sessão ou id inválido: recusa', async () => {
    expect((await checkPaymentAction('abc')).ok).toBe(false)
    session = null
    expect((await checkPaymentAction(ORDER)).ok).toBe(false)
    session = newUser()
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
    expect((await checkPaymentAction(ORDER)).ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('limite por minuto, por conta', async () => {
    userRpc.mockResolvedValue(paid)
    const results = []
    for (let i = 0; i < 17; i++) results.push(await checkPaymentAction(ORDER))
    expect(results.filter((r) => r.ok)).toHaveLength(15)
  })
})

describe('payOrderAction: recusa que o Mercado Pago devolve como erro HTTP (402)', () => {
  beforeEach(setup)
  afterEach(teardown)

  test('402 com a ordem em `data`: mostra o motivo da recusa e não trata como falha técnica', async () => {
    userRpc.mockResolvedValueOnce(begun())
    const failed = gw('failed', 'failed', { status_detail: undefined })
    fetchMock.mockResolvedValueOnce(
      json({ errors: [{ code: 'failed', message: 'The following transactions failed', details: ['PAY01TESTE: insufficient_amount'] }], data: failed }, 402),
    )
    const r = await payOrderAction(card)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/limite/) })
    expect(recorded()[0]).toMatchObject({ p_status: 'recusado', p_status_detail: 'insufficient_amount', p_open_minutes: 1 })
  })
})
