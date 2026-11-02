import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * Ações de pagamento (startCheckoutAction, orderStatusAction) com o banco e o Mercado Pago simulados.
 * O que se garante: o navegador só manda ids (preço enviado por ele é ignorado), a venda só abre ligada no servidor,
 * mensagens do banco só passam se forem as conhecidas, e o aluno só é mandado para endereços do Mercado Pago.
 */

const rpc = vi.fn()
let session: { user: { id: string }; supabase: { rpc: typeof rpc } } | null = null
vi.mock('@/lib/actions/shared', () => ({ actionContext: async () => session }))

import { orderStatusAction, startCheckoutAction } from '@/lib/actions/checkout'

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const MP_URL = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1-abc'
let n = 0
const newUser = () => ({ user: { id: 'user-' + ++n }, supabase: { rpc } })

const created = (over: Record<string, unknown> = {}) => ({
  data: { orderId: ORDER, totalCents: 8289, checkoutUrl: null, items: [{ courseId: 'mkt', title: 'Marketing', priceCents: 3299 }, { courseId: 'design', title: 'Design', priceCents: 4990 }], ...over },
  error: null,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('startCheckoutAction', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.stubEnv('PAYMENTS_ENABLED', 'true')
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'TOKEN-DE-TESTE')
    vi.stubEnv('MERCADOPAGO_WEBHOOK_SECRET', 'segredo')
    session = newUser()
    rpc.mockReset()
    fetchMock = vi.fn().mockResolvedValue(json({ id: '1-abc', init_point: MP_URL }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  test('caminho feliz: cria o pedido só com ids, cria o link com a foto do banco e devolve o endereço guardado', async () => {
    rpc.mockResolvedValueOnce(created()).mockResolvedValueOnce({ data: { checkoutUrl: MP_URL }, error: null })
    const r = await startCheckoutAction({ courseIds: ['mkt', 'design'] })
    expect(r).toEqual({ ok: true, url: MP_URL, orderId: ORDER })
    expect(rpc).toHaveBeenNthCalledWith(1, 'create_order', { p_course_ids: ['mkt', 'design'] })
    expect(rpc).toHaveBeenNthCalledWith(2, 'attach_order_checkout', { p_order: ORDER, p_preference_id: '1-abc', p_url: MP_URL })
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)
    expect(body.external_reference).toBe(ORDER)
    expect(body.items.map((i: { unit_price: number }) => i.unit_price)).toEqual([32.99, 49.9])
  })

  test('preço, total ou título enviados pelo navegador são ignorados', async () => {
    rpc.mockResolvedValueOnce(created()).mockResolvedValueOnce({ data: { checkoutUrl: MP_URL }, error: null })
    const r = await startCheckoutAction({ courseIds: ['mkt'], priceCents: 1, totalCents: 1, items: [{ price: 0.01 }] })
    expect(r.ok).toBe(true)
    expect(rpc.mock.calls[0]).toEqual(['create_order', { p_course_ids: ['mkt'] }])
  })

  test('pedido em aberto que já tem link: volta para o mesmo pagamento, sem criar outro no Mercado Pago', async () => {
    rpc.mockResolvedValueOnce(created({ checkoutUrl: MP_URL }))
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: true, url: MP_URL, orderId: ORDER })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('venda desligada no servidor: não cria pedido nem chama o Mercado Pago', async () => {
    for (const off of ['false', '', 'TRUE']) {
      vi.stubEnv('PAYMENTS_ENABLED', off)
      const r = await startCheckoutAction({ courseIds: ['mkt'] })
      expect(r).toEqual({ ok: false, error: 'O pagamento online ainda não está disponível.' })
    }
    vi.stubEnv('PAYMENTS_ENABLED', 'true')
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test.each([[undefined], [null], [{}], [{ courseIds: [] }], [{ courseIds: ['MAIÚSCULA'] }], [{ courseIds: ["a'; drop"] }], [{ courseIds: 'mkt' }], [{ courseIds: Array(60).fill('mkt') }]])(
    'entrada inválida %j é recusada sem tocar no banco',
    async (input) => {
      expect((await startCheckoutAction(input)).ok).toBe(false)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  test('sem sessão: pede para entrar de novo', async () => {
    session = null
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' })
    expect(rpc).not.toHaveBeenCalled()
  })

  test('limite de pedidos por minuto, por conta', async () => {
    rpc.mockResolvedValue(created({ checkoutUrl: MP_URL }))
    const results = []
    for (let i = 0; i < 10; i++) results.push(await startCheckoutAction({ courseIds: ['mkt'] }))
    expect(results.filter((r) => r.ok)).toHaveLength(8)
    expect(results[9]).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
    // Outra conta não é afetada.
    session = newUser()
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(true)
  })

  test('mensagem conhecida do banco vai para a tela; qualquer outra vira a genérica', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'Nenhum curso do carrinho está à venda.' } })
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Nenhum curso do carrinho está à venda.' })
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'FC422', message: 'relation "private.orders" does not exist' } })
    const r = await startCheckoutAction({ courseIds: ['mkt'] })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('private.orders')
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'FY429', message: 'limite' } })
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: false, error: 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' })
  })

  test('Mercado Pago recusa criar o link: erro genérico e nada é guardado', async () => {
    rpc.mockResolvedValueOnce(created())
    fetchMock.mockResolvedValue(json({ message: 'TOKEN-DE-TESTE inválido' }, 401))
    const r = await startCheckoutAction({ courseIds: ['mkt'] })
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('TOKEN')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('endereço fora do Mercado Pago nunca chega ao aluno (vindo do banco ou da API)', async () => {
    rpc.mockResolvedValueOnce(created({ checkoutUrl: 'https://evil.com/mercadopago.com.br/' }))
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)

    rpc.mockResolvedValueOnce(created())
    fetchMock.mockResolvedValue(json({ id: '1-abc', init_point: 'https://evil.com/pagar' }))
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)
    expect(rpc).toHaveBeenCalledTimes(2)

    rpc.mockResolvedValueOnce(created()).mockResolvedValueOnce({ data: { checkoutUrl: 'http://www.mercadopago.com.br/x' }, error: null })
    fetchMock.mockResolvedValue(json({ id: '1-abc', init_point: MP_URL }))
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)
  })

  test('duas abas ao mesmo tempo: vale o link que o banco guardou primeiro', async () => {
    const first = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=PRIMEIRO'
    rpc.mockResolvedValueOnce(created()).mockResolvedValueOnce({ data: { checkoutUrl: first }, error: null })
    expect(await startCheckoutAction({ courseIds: ['mkt'] })).toEqual({ ok: true, url: first, orderId: ORDER })
  })

  test('resposta estranha do banco: erro genérico', async () => {
    rpc.mockResolvedValueOnce({ data: { orderId: 'não-é-uuid' }, error: null })
    expect((await startCheckoutAction({ courseIds: ['mkt'] })).ok).toBe(false)
  })
})

describe('orderStatusAction', () => {
  beforeEach(() => {
    session = newUser()
    rpc.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  test('devolve o status do próprio pedido', async () => {
    rpc.mockResolvedValueOnce({ data: { status: 'pago', totalCents: 8289, paidAt: '2026-11-02T12:00:00Z', items: [{ courseId: 'mkt', title: 'Marketing' }] }, error: null })
    const r = await orderStatusAction(ORDER)
    expect(r).toEqual({ ok: true, order: { status: 'pago', totalCents: 8289, paidAt: '2026-11-02T12:00:00Z', items: [{ courseId: 'mkt', title: 'Marketing' }] } })
    expect(rpc).toHaveBeenCalledWith('order_status', { p_order: ORDER })
  })

  test('id que não é uuid não chega ao banco', async () => {
    for (const bad of [undefined, '', 'abc', "x'; drop", 42, null]) expect((await orderStatusAction(bad)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('pedido de outra conta (o banco devolve nulo) ou erro: falha sem detalhes', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null })
    expect((await orderStatusAction(ORDER)).ok).toBe(false)
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied for table orders' } })
    const r = await orderStatusAction(ORDER)
    expect(JSON.stringify(r)).not.toContain('orders')
  })

  test('sem sessão: pede para entrar de novo', async () => {
    session = null
    expect((await orderStatusAction(ORDER)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })
})
