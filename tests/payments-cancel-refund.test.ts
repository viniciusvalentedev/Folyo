import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * "Cancelar e tentar de novo" (aluno) e "Estornar" (painel), com o banco e o Mercado Pago simulados.
 * O que se garante:
 *  - o pedido só é solto depois que o Mercado Pago confirma o cancelamento (nunca só no nosso banco: risco de cobrar duas vezes);
 *  - se o Mercado Pago recusa cancelar porque o pagamento acabou de ser aprovado, o pedido vira "pago" (nada de duas cobranças);
 *  - "em análise" não cancela;
 *  - o estorno só é pedido ao Mercado Pago depois que o BANCO autoriza (papel, pedido e registro de quem pediu);
 *  - o acesso só sai quando a ordem LIDA no Mercado Pago diz "estornada";
 *  - ids, motivo e respostas estranhas não passam, e chaves não aparecem no log nem na resposta.
 */

vi.mock('server-only', () => ({}))

const userRpc = vi.fn()
const serviceRpc = vi.fn()
type TestDb = { rpc: typeof userRpc }
let session: { user: { id: string }; supabase: TestDb } | null = null
vi.mock('@/lib/actions/shared', () => ({
  actionContext: async () => session,
  EXPIRED: { ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' },
  INVALID: { ok: false, error: 'Não deu para salvar: dados inválidos.' },
  FAILED: { ok: false, error: 'Não foi possível salvar agora. Tente de novo em instantes.' },
}))
vi.mock('@/lib/supabase/service', () => ({ createSupabaseServiceClient: () => ({ rpc: serviceRpc }) }))
vi.mock('@/lib/email/send', () => ({ sendOrderReceipt: async () => {} }))
const afterCallbacks: Array<() => Promise<void> | void> = []
vi.mock('next/server', () => ({ after: (fn: () => Promise<void> | void) => afterCallbacks.push(fn) }))

import { cancelPaymentAction } from '@/lib/actions/checkout'
import { refundOrderAction } from '@/lib/actions/refund'

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const PROVIDER = 'ORD01TESTE'
const TOKEN_ENV = 'TOKEN-SECRETO-DE-TESTE'
const ITEMS = [{ courseId: 'mkt', title: 'Marketing', priceCents: 3299 }]
let n = 0
const newUser = () => ({ user: { id: 'user-' + ++n }, supabase: { rpc: userRpc } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const gw = (status: string, detail: string) => ({
  id: PROVIDER,
  status,
  status_detail: detail,
  external_reference: ORDER,
  total_amount: '32.99',
  currency: 'BRL',
  transactions: { payments: [{ id: 'PAY01TESTE', status, status_detail: detail, amount: '32.99' }] },
})

let fetchMock: ReturnType<typeof vi.fn>
let logs: string[]
function setup() {
  vi.stubEnv('PAYMENTS_ENABLED', 'true')
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', TOKEN_ENV)
  vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-do-webhook')
  vi.stubEnv('MERCADOPAGO_PUBLIC_KEY', 'APP_USR-abc12345-test')
  session = newUser()
  userRpc.mockReset()
  serviceRpc.mockReset()
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
const noSecretsLeaked = (...texts: string[]) => {
  for (const t of [...texts, ...logs]) for (const secret of [TOKEN_ENV, 'segredo-do-webhook']) expect(t, secret).not.toContain(secret)
}
const calledFns = () => serviceRpc.mock.calls.map(([fn]) => fn as string)
const callArgs = (fn: string) => serviceRpc.mock.calls.find(([name]) => name === fn)?.[1] as Record<string, unknown> | undefined

describe('cancelPaymentAction ("Cancelar e tentar de novo")', () => {
  beforeEach(setup)
  afterEach(teardown)

  const status = (over: Record<string, unknown> = {}) => ({
    data: {
      status: 'pendente',
      totalCents: 3299,
      paidAt: null,
      expiresAt: '2026-11-04T12:00:00Z',
      items: ITEMS,
      attempt: { method: 'pix', status: 'aguardando_pix', statusDetail: 'waiting_transfer', open: true, pix: null },
      ...over,
    },
    error: null,
  })
  const threeDs = status({ attempt: { method: 'cartao', status: 'aguardando_acao', statusDetail: 'pending_challenge', open: true, pix: null } })
  const canceled = status({ status: 'cancelado', attempt: null })
  const paid = status({ status: 'pago', paidAt: '2026-11-02T12:00:00Z', attempt: null })
  const dbOk = () =>
    serviceRpc.mockImplementation(async (fn: string) => {
      if (fn === 'payment_attempt_ref') return { data: { providerOrderId: PROVIDER, status: 'aguardando_pix' }, error: null }
      if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
      if (fn === 'apply_payment') return { data: { result: 'liberado' }, error: null }
      return { data: null, error: null }
    })

  test('Pix aberto: cancela no Mercado Pago, marca a tentativa como cancelada e devolve o pedido liberado', async () => {
    userRpc.mockResolvedValueOnce(status()).mockResolvedValueOnce(canceled)
    dbOk()
    fetchMock.mockResolvedValueOnce(json(gw('canceled', 'canceled_by_user')))
    const r = await cancelPaymentAction(ORDER)
    expect(r).toMatchObject({ ok: true, order: { status: 'cancelado' } })
    const [url, init] = fetchMock.mock.calls[0] as [string, { method?: string }]
    expect(url).toBe(`https://api.mercadopago.com/v1/orders/${PROVIDER}/cancel`)
    expect(init.method).toBe('POST')
    expect(serviceRpc).toHaveBeenCalledWith('payment_attempt_ref', { p_order: ORDER, p_user: session!.user.id })
    expect(callArgs('settle_payment_attempt')).toMatchObject({ p_provider_order_id: PROVIDER, p_status: 'cancelado' })
    expect(calledFns()).not.toContain('apply_payment')
    noSecretsLeaked(JSON.stringify(r))
  })

  test('3DS aguardando o banco: também cancela', async () => {
    userRpc.mockResolvedValueOnce(threeDs).mockResolvedValueOnce(canceled)
    dbOk()
    fetchMock.mockResolvedValueOnce(json(gw('canceled', 'canceled_by_user')))
    expect(await cancelPaymentAction(ORDER)).toMatchObject({ ok: true, order: { status: 'cancelado' } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('Mercado Pago recusa cancelar porque o pagamento acabou de ser aprovado: o pedido vira "pago", sem cobrar duas vezes', async () => {
    userRpc.mockResolvedValueOnce(status()).mockResolvedValueOnce(paid)
    dbOk()
    fetchMock.mockResolvedValueOnce(json({ errors: [{ code: 'cannot_cancel_order' }] }, 409)).mockResolvedValueOnce(json(gw('processed', 'accredited')))
    const r = await cancelPaymentAction(ORDER)
    expect(r).toMatchObject({ ok: true, order: { status: 'pago' } })
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`https://api.mercadopago.com/v1/orders/${PROVIDER}`)
    expect(callArgs('apply_payment')).toMatchObject({ p_order: ORDER, p_status: 'approved' })
    expect(afterCallbacks).toHaveLength(1)
  })

  test('Mercado Pago não cancelou e a ordem continua aberta: o bloqueio fica e a pessoa é avisada', async () => {
    userRpc.mockResolvedValueOnce(status()).mockResolvedValueOnce(status())
    dbOk()
    fetchMock.mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json(gw('action_required', 'waiting_transfer')))
    const r = await cancelPaymentAction(ORDER)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Não foi possível cancelar') })
    expect(callArgs('settle_payment_attempt')).toMatchObject({ p_status: 'aguardando_pix' })
    expect(callArgs('settle_payment_attempt')).not.toMatchObject({ p_status: 'cancelado' })
  })

  test('Mercado Pago fora do ar de vez: avisa e não solta o pedido', async () => {
    userRpc.mockResolvedValueOnce(status()).mockResolvedValueOnce(status())
    dbOk()
    fetchMock.mockResolvedValue(json({}, 503))
    expect(await cancelPaymentAction(ORDER)).toMatchObject({ ok: false, error: expect.stringContaining('Não foi possível cancelar') })
    expect(calledFns()).not.toContain('settle_payment_attempt')
  })

  test('pagamento "em análise" não cancela (pode ser aprovado a qualquer momento)', async () => {
    userRpc.mockResolvedValueOnce(status({ attempt: { method: 'cartao', status: 'processando', statusDetail: 'in_process', open: true, pix: null } }))
    const r = await cancelPaymentAction(ORDER)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('em análise') })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('nada em andamento (sem tentativa, tentativa fechada ou pedido já pago): devolve o estado de agora, sem chamar o Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(status({ attempt: null }))
    expect((await cancelPaymentAction(ORDER)).ok).toBe(true)
    userRpc.mockResolvedValueOnce(status({ attempt: { method: 'cartao', status: 'recusado', statusDetail: 'x', open: false, pix: null } }))
    expect((await cancelPaymentAction(ORDER)).ok).toBe(true)
    userRpc.mockResolvedValueOnce(paid)
    expect(await cancelPaymentAction(ORDER)).toMatchObject({ ok: true, order: { status: 'pago' } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('pedido de outra conta (o banco devolve nulo): nada é consultado nem cancelado', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await cancelPaymentAction(ORDER)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('referência estranha vinda do banco não vira chamada ao Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(status())
    serviceRpc.mockResolvedValue({ data: { providerOrderId: '../../x?y=1' }, error: null })
    expect((await cancelPaymentAction(ORDER)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('id inválido, sem sessão ou sem chaves do Mercado Pago: recusa sem tocar no banco', async () => {
    for (const bad of [undefined, '', 'abc', "x'; drop", 42, null, { id: ORDER }]) expect((await cancelPaymentAction(bad)).ok).toBe(false)
    session = null
    expect((await cancelPaymentAction(ORDER)).ok).toBe(false)
    session = newUser()
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
    expect((await cancelPaymentAction(ORDER)).ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('limite por minuto, por conta', async () => {
    userRpc.mockResolvedValue(paid)
    const results = []
    for (let i = 0; i < 8; i++) results.push(await cancelPaymentAction(ORDER))
    expect(results.filter((r) => r.ok)).toHaveLength(6)
  })
})

describe('refundOrderAction ("Estornar" no painel)', () => {
  beforeEach(setup)
  afterEach(teardown)

  const begun = (over: Record<string, unknown> = {}) => ({ data: { orderId: ORDER, providerOrderId: PROVIDER, ...over }, error: null })
  const dbOk = (applied = 'revogado') =>
    serviceRpc.mockImplementation(async (fn: string) => {
      if (fn === 'settle_payment_attempt') return { data: { orderId: ORDER }, error: null }
      if (fn === 'apply_payment') return { data: { result: applied }, error: null }
      return { data: null, error: null }
    })
  const input = { orderId: ORDER, reason: '  Pediu o dinheiro de volta.  ' }

  test('o banco autoriza, o Mercado Pago estorna TUDO e o acesso sai: done = true', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk()
    fetchMock.mockResolvedValueOnce(json(gw('refunded', 'refunded')))
    const r = await refundOrderAction(input)
    expect(r).toEqual({ ok: true, done: true })
    expect(userRpc).toHaveBeenCalledWith('admin_refund_begin', { p_order: ORDER, p_reason: 'Pediu o dinheiro de volta.' })
    const [url, init] = fetchMock.mock.calls[0] as [string, { method?: string; body?: unknown }]
    expect(url).toBe(`https://api.mercadopago.com/v1/orders/${PROVIDER}/refund`)
    expect(init.method).toBe('POST')
    expect(String(init.body ?? '')).not.toContain('amount')
    expect(callArgs('apply_payment')).toMatchObject({ p_order: ORDER, p_status: 'refunded' })
    noSecretsLeaked(JSON.stringify(r))
  })

  test('o banco recusa (sem papel de administrador, sem a verificação em duas etapas, pedido não pago): nada é pedido ao Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: { code: 'FA403', message: 'Seu papel não permite estornar compras.' } })
    const r = await refundOrderAction(input)
    expect(r).toMatchObject({ ok: false, error: 'Seu papel não permite estornar compras.' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(serviceRpc).not.toHaveBeenCalled()
  })

  test('erro técnico do banco não vaza detalhes', async () => {
    userRpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for table orders' } })
    const r = await refundOrderAction(input)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('orders')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('Mercado Pago ainda não terminou o estorno: pedido aceito, acesso sai depois pelo aviso dele (done = false)', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk('ja_processado')
    fetchMock.mockResolvedValueOnce(json(gw('refunded', 'refunded')))
    expect(await refundOrderAction(input)).toEqual({ ok: true, done: false })
  })

  test('Mercado Pago dá erro, mas a releitura mostra a ordem estornada: conta como feito', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk()
    fetchMock.mockResolvedValueOnce(json({}, 504)).mockResolvedValueOnce(json(gw('refunded', 'refunded')))
    expect(await refundOrderAction(input)).toEqual({ ok: true, done: true })
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(`https://api.mercadopago.com/v1/orders/${PROVIDER}`)
  })

  test('Mercado Pago recusa o estorno e a ordem continua paga: mostra o motivo e NÃO tira o acesso', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk()
    fetchMock.mockResolvedValueOnce(json({ errors: [{ code: 'cannot_refund_order' }] }, 422)).mockResolvedValueOnce(json(gw('processed', 'accredited')))
    const r = await refundOrderAction(input)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('não aceitou o estorno') })
    expect(calledFns()).not.toContain('apply_payment')
  })

  test('Mercado Pago fora do ar na ida e na volta: pede para conferir antes de tentar de novo', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk()
    fetchMock.mockResolvedValue(json({}, 503))
    expect(await refundOrderAction(input)).toMatchObject({ ok: false, error: expect.stringContaining('Não conseguimos confirmar o estorno') })
    expect(calledFns()).not.toContain('apply_payment')
  })

  test('resposta estranha do banco (referência fora do padrão ou de outro pedido) não vira chamada ao Mercado Pago', async () => {
    userRpc.mockResolvedValueOnce(begun({ providerOrderId: '../../x?y=1' }))
    expect((await refundOrderAction(input)).ok).toBe(false)
    userRpc.mockResolvedValueOnce(begun({ orderId: '11111111-2222-4333-8444-555555555555' }))
    expect((await refundOrderAction(input)).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('entrada inválida (id ruim, motivo grande demais, formato errado) não chega ao banco', async () => {
    for (const bad of [undefined, null, {}, { orderId: 'abc' }, { orderId: ORDER, reason: 'x'.repeat(301) }, { orderId: ORDER, reason: 42 }, 'texto']) {
      expect((await refundOrderAction(bad)).ok).toBe(false)
    }
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('sem motivo: tudo bem (vai vazio para o histórico)', async () => {
    userRpc.mockResolvedValueOnce(begun())
    dbOk()
    fetchMock.mockResolvedValueOnce(json(gw('refunded', 'refunded')))
    expect((await refundOrderAction({ orderId: ORDER })).ok).toBe(true)
    expect(userRpc).toHaveBeenCalledWith('admin_refund_begin', { p_order: ORDER, p_reason: '' })
  })

  test('sem sessão ou sem chaves do Mercado Pago: recusa sem tocar no banco', async () => {
    session = null
    expect((await refundOrderAction(input)).ok).toBe(false)
    session = newUser()
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
    expect((await refundOrderAction(input)).ok).toBe(false)
    expect(userRpc).not.toHaveBeenCalled()
  })

  test('limite por minuto, por conta', async () => {
    userRpc.mockResolvedValue({ data: null, error: { code: 'FA403', message: 'Seu papel não permite estornar compras.' } })
    for (let i = 0; i < 12; i++) await refundOrderAction(input)
    expect(userRpc).toHaveBeenCalledTimes(10)
  })
})
