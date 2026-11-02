import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import type { GatewayOrder } from '@/lib/payments/mercadopago'
import { applyGatewayOrder, reconcileGatewayOrder, ReconcileError } from '@/lib/payments/reconcile'

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const cfg = { accessToken: 'TOKEN-SECRETO-DE-TESTE', webhookSecret: 'x', publicKey: 'APP_USR-abc12345-test' }

const order = (over: Partial<GatewayOrder> = {}, payment: Partial<NonNullable<GatewayOrder['payment']>> | null = {}): GatewayOrder => ({
  id: 'ORD01TESTE',
  status: 'processed',
  statusDetail: 'accredited',
  externalReference: ORDER,
  totalCents: 8289,
  currency: 'BRL',
  paymentCount: 1,
  payment:
    payment === null
      ? null
      : { id: 'PAY01TESTE', status: 'processed', statusDetail: 'accredited', amountCents: 8289, expiresAt: null, pix: null, threeDsUrl: null, ...payment },
  ...over,
})

type Answer = { data?: unknown; error?: { code: string; message: string } | null }
function db(answers: Record<string, Answer | (() => Answer)> = {}) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const defaults: Record<string, Answer> = {
    settle_payment_attempt: { data: { orderId: ORDER }, error: null },
    apply_payment: { data: { result: 'liberado' }, error: null },
  }
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args })
    const a = answers[fn] ?? defaults[fn]
    const r = typeof a === 'function' ? a() : a
    return { data: r.data ?? null, error: r.error ?? null }
  })
  return { client: { rpc } as never, rpc, calls, names: () => calls.map((c) => c.fn) }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('applyGatewayOrder', () => {
  test('aprovado: atualiza a tentativa e aplica o pagamento com o valor e a moeda lidos do Mercado Pago', async () => {
    const d = db()
    const r = await applyGatewayOrder(d.client, order())
    expect(r).toEqual({ kind: 'ok', orderId: ORDER, result: 'liberado', receiptDue: true })
    expect(d.names()).toEqual(['settle_payment_attempt', 'apply_payment'])
    expect(d.calls[0].args).toMatchObject({ p_provider_order_id: 'ORD01TESTE', p_status: 'aprovado', p_provider_payment_id: 'PAY01TESTE' })
    expect(d.calls[1].args).toEqual({ p_order: ORDER, p_payment_id: 'PAY01TESTE', p_status: 'approved', p_amount_cents: 8289, p_currency: 'BRL' })
  })

  test('id do pedido em maiúsculas é normalizado para minúsculas', async () => {
    const d = db({ settle_payment_attempt: { data: { orderId: ORDER } } })
    const r = await applyGatewayOrder(d.client, order({ externalReference: ORDER.toUpperCase() }))
    expect(r).toMatchObject({ kind: 'ok', orderId: ORDER })
    expect(d.calls[1].args.p_order).toBe(ORDER)
  })

  test('ja_processado também pede o recibo (reenvia se o e-mail falhou antes)', async () => {
    const d = db({ apply_payment: { data: { result: 'ja_processado' } } })
    expect(await applyGatewayOrder(d.client, order())).toMatchObject({ result: 'ja_processado', receiptDue: true })
  })

  test.each(['valor_divergente', 'pagamento_duplicado', 'sem_conta', 'pedido_inexistente'])('resultado %s não manda recibo', async (result) => {
    const d = db({ apply_payment: { data: { result } } })
    const r = await applyGatewayOrder(d.client, order())
    expect(r).toMatchObject({ kind: 'ok', result, receiptDue: false })
  })

  test('resultados que pedem atenção vão para o log de erro', async () => {
    const d = db({ apply_payment: { data: { result: 'valor_divergente' } } })
    await applyGatewayOrder(d.client, order())
    expect(console.error).toHaveBeenCalledWith('Pagamento precisa de atenção', expect.objectContaining({ result: 'valor_divergente', orderId: ORDER }))
  })

  test('reembolso e estorno são aplicados e não pedem recibo', async () => {
    for (const [status, detail, apply] of [
      ['refunded', 'refunded', 'refunded'],
      ['charged_back', 'in_process', 'charged_back'],
    ] as const) {
      const d = db({ apply_payment: { data: { result: 'reembolsado' } } })
      const r = await applyGatewayOrder(d.client, order({ status, statusDetail: detail }))
      expect(r).toMatchObject({ kind: 'ok', receiptDue: false })
      expect(d.calls[1].args.p_status).toBe(apply)
    }
  })

  test('recusado: só atualiza a tentativa, nunca chama apply_payment', async () => {
    const d = db()
    const r = await applyGatewayOrder(d.client, order({ status: 'failed', statusDetail: 'failed' }, { status: 'failed', statusDetail: 'rejected_by_issuer' }))
    expect(r).toEqual({ kind: 'ok', orderId: ORDER, result: null, receiptDue: false })
    expect(d.names()).toEqual(['settle_payment_attempt'])
    expect(d.calls[0].args.p_status).toBe('recusado')
  })

  test('aguardando ação do banco / Pix: não libera nada', async () => {
    const d = db()
    const r = await applyGatewayOrder(d.client, order({ status: 'action_required', statusDetail: 'waiting_transfer' }, { status: 'action_required', statusDetail: 'waiting_transfer' }))
    expect(r).toMatchObject({ kind: 'ok', receiptDue: false })
    expect(d.names()).toEqual(['settle_payment_attempt'])
  })

  test('sem external_reference ou com valor que não é id: ignora sem tocar no banco', async () => {
    for (const externalReference of [null, '', 'abc', '1; drop table orders', ORDER + 'x']) {
      const d = db()
      expect(await applyGatewayOrder(d.client, order({ externalReference })), String(externalReference)).toEqual({ kind: 'ignorado', reason: 'sem_pedido' })
      expect(d.rpc).not.toHaveBeenCalled()
    }
  })

  test('estado desconhecido do Mercado Pago é ignorado (e anotado), sem tocar no banco', async () => {
    const d = db()
    expect(await applyGatewayOrder(d.client, order({ status: 'novo_estado_qualquer', statusDetail: null }))).toEqual({ kind: 'ignorado', reason: 'estado_desconhecido' })
    expect(d.rpc).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  test('ordem registrada para OUTRO pedido: não aplica nada', async () => {
    const other = '11111111-2222-4333-8444-555555555555'
    const d = db({ settle_payment_attempt: { data: { orderId: other } } })
    expect(await applyGatewayOrder(d.client, order())).toEqual({ kind: 'inconsistente', orderId: ORDER })
    expect(d.names()).toEqual(['settle_payment_attempt'])
  })

  test('ordem desconhecida pelo banco (orderId nulo) ainda aplica: o apply_payment confere pelo pedido', async () => {
    for (const data of [{ orderId: null }, {}]) {
      const d = db({ settle_payment_attempt: { data } })
      expect(await applyGatewayOrder(d.client, order())).toMatchObject({ kind: 'ok', result: 'liberado' })
      expect(d.names()).toEqual(['settle_payment_attempt', 'apply_payment'])
    }
  })

  test.each([
    ['sem pagamento', order({ paymentCount: 0 }, null)],
    ['dois pagamentos', order({ paymentCount: 2 })],
    ['pagamento sem valor', order({}, { amountCents: null })],
    ['valor absurdo', order({}, { amountCents: 2_000_000_001 })],
  ])('pagamento anormal (%s) não libera acesso', async (_name, o) => {
    const d = db()
    expect(await applyGatewayOrder(d.client, o)).toEqual({ kind: 'ignorado', reason: 'pagamento_anomalo' })
    expect(d.names()).toEqual(['settle_payment_attempt'])
  })

  test('erro do banco vira ReconcileError só com o código (o webhook responde erro e o MP avisa de novo)', async () => {
    const settle = db({ settle_payment_attempt: { error: { code: '57014', message: 'timeout com detalhes internos' } } })
    await expect(applyGatewayOrder(settle.client, order())).rejects.toMatchObject({ name: 'ReconcileError', code: '57014' })
    await expect(applyGatewayOrder(settle.client, order())).rejects.not.toThrow(/detalhes internos/)

    const apply = db({ apply_payment: { error: { code: '40001', message: 'x' } } })
    await expect(applyGatewayOrder(apply.client, order())).rejects.toBeInstanceOf(ReconcileError)
  })

  test('resposta fora do formato esperado vira ReconcileError', async () => {
    const badSettle = db({ settle_payment_attempt: { data: { orderId: 'não é uuid' } } })
    await expect(applyGatewayOrder(badSettle.client, order())).rejects.toBeInstanceOf(ReconcileError)
    const badApply = db({ apply_payment: { data: 'liberado' } })
    await expect(applyGatewayOrder(badApply.client, order())).rejects.toBeInstanceOf(ReconcileError)
    const noResult = db({ apply_payment: { data: null } })
    await expect(applyGatewayOrder(noResult.client, order())).rejects.toBeInstanceOf(ReconcileError)
  })
})

describe('reconcileGatewayOrder', () => {
  const okBody = {
    id: 'ORD01TESTE',
    status: 'processed',
    status_detail: 'accredited',
    external_reference: ORDER,
    total_amount: '82.89',
    currency: 'BRL',
    transactions: { payments: [{ id: 'PAY01TESTE', status: 'processed', status_detail: 'accredited', amount: '82.89' }] },
  }

  test('lê a ordem na API com o nosso token e aplica', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(okBody), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const d = db()
    const r = await reconcileGatewayOrder(cfg, d.client, 'ORD01TESTE')
    expect(r).toMatchObject({ kind: 'ok', result: 'liberado', receiptDue: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.mercadopago.com/v1/orders/ORD01TESTE')
    expect(JSON.stringify(init.headers)).toContain('Bearer TOKEN-SECRETO-DE-TESTE')
    vi.unstubAllGlobals()
  })

  test('ordem que não existe: ignorada, sem tocar no banco', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const d = db()
    expect(await reconcileGatewayOrder(cfg, d.client, 'ORD404')).toEqual({ kind: 'ignorado', reason: 'sem_ordem' })
    expect(d.rpc).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
