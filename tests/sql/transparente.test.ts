import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, type Db } from './db'

/**
 * Checkout Transparente (cartão e Pix dentro do site), rodando as migrations DE VERDADE (Postgres em memória).
 * Foco em segurança: o valor sai do pedido no banco, cada pedido é só do dono, há limites contra teste de cartões,
 * nunca dois pagamentos ao mesmo tempo, e só o service_role grava o que o Mercado Pago respondeu.
 */

const migrations = loadMigrations()

type Order = { orderId: string; totalCents: number; items: { courseId: string; title: string; priceCents: number }[] }
type Begun = {
  reused: boolean
  attemptId: string
  orderId: string
  totalCents: number
  installments?: number
  email?: string
  items?: { courseId: string; title: string; priceCents: number }[]
  pix?: { code: string; qrBase64: string | null; ticketUrl: string | null; expiresAt: string | null }
}
type Status = {
  status: string
  expiresAt: string
  items: { courseId: string; priceCents: number }[]
  attempt: { method: string; status: string; statusDetail: string | null; open: boolean; pix: { code: string } | null } | null
} | null

const PIX_CODE = '00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-426614174000520400005303986540510.005802BR5909Folyo6009SAO PAULO62070503***6304ABCD'
const QR = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const PIX_URL = 'https://www.mercadopago.com.br/payments/123456/ticket?caller_id=1&hash=abc'

describe.skipIf(!migrations)('checkout transparente (SQL)', () => {
  let db: Db
  let seq = 0
  let provider = 1

  const ok = <T>(r: { ok: true; data: T } | { ok: false; code: string; message: string }): T => {
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`)
    return r.data
  }
  const fail = (r: { ok: boolean; code?: string; message?: string }, code: string, message?: RegExp) => {
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe(code)
      if (message) expect(r.message).toMatch(message)
    }
  }

  async function runAs<T>(role: 'service_role' | 'authenticated' | 'anon', sql: string, params: unknown[] = []) {
    try {
      const data = await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`)
        return (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T
      })
      return { ok: true as const, data }
    } catch (error) {
      const e = error as { code?: string; message?: string }
      return { ok: false as const, code: e.code ?? '', message: e.message ?? String(error) }
    }
  }

  /** Uma conta nova por teste (cada uma com o seu pedido e os seus limites). */
  const fresh = async () => createUser(db, `aluno${++seq}@folyo.test`)
  const order = async (uid: string, ids: string[] = ['mkt']) => ok(await rpc<Order>(db, { uid }, 'select public.create_order($1::text[]) as r', [ids]))
  const begin = (uid: string, orderId: string, method: string, installments?: number) =>
    installments === undefined
      ? rpc<Begun>(db, { uid }, 'select public.begin_payment_attempt($1, $2) as r', [orderId, method])
      : rpc<Begun>(db, { uid }, 'select public.begin_payment_attempt($1, $2, $3) as r', [orderId, method, installments])
  const status = (uid: string, orderId: string) => rpc<Status>(db, { uid }, 'select public.order_status($1) as r', [orderId])

  /** Grava a resposta do Mercado Pago (como o servidor faz). */
  const record = (attempt: string, st: string, detail: string | null = null, providerOrder: string | null = `ORD${provider++}`, minutes = 30, pix: [string | null, string | null, string | null] = [null, null, null]) =>
    runAs<{ result: string }>(
      'service_role',
      'select public.record_payment_attempt($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) as r',
      [attempt, st, detail, providerOrder, `PAY${provider}`, minutes, pix[0], pix[1], pix[2], pix[0] ? new Date(Date.now() + 3_600_000).toISOString() : null],
    )
  const settle = (providerOrder: string, st: string, detail: string | null = null) =>
    runAs<{ orderId: string | null; status?: string }>('service_role', 'select public.settle_payment_attempt($1, $2, $3) as r', [providerOrder, st, detail])
  const attemptRow = async (id: string) =>
    (await db.query<{ status: string; open_until: string; pix_code: string | null; user_id: string | null }>('select status, open_until, pix_code, user_id from private.payment_attempts where id = $1', [id])).rows[0]

  /** Começa uma tentativa e já a deixa como recusada (estado final). */
  async function declined(uid: string, orderId: string) {
    const b = ok(await begin(uid, orderId, 'cartao', 1))
    ok(await record(b.attemptId, 'recusado', 'rejected_by_issuer'))
    return b
  }

  async function addCourse(id: string, title: string, price: number) {
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso.', 'publicado')`, [id, title])
    await db.query('update public.courses set price_cents = $2 where id = $1', [id, price])
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    await addCourse('mkt', 'Marketing Estratégico', 3299)
    await addCourse('design', 'Design Gráfico', 4990)
    await addCourse('prog', 'Programação', 6990)
    await addCourse('ux', 'UX Writing', 2500)
  }, 120_000)

  describe('begin_payment_attempt', () => {
    test('o valor e os itens vêm do pedido no banco, e o e-mail da conta', async () => {
      const uid = await fresh()
      const o = await order(uid, ['mkt', 'design'])
      const b = ok(await begin(uid, o.orderId, 'cartao', 3))
      expect(b.reused).toBe(false)
      expect(b.orderId).toBe(o.orderId)
      expect(b.totalCents).toBe(8289)
      expect(b.installments).toBe(3)
      expect(b.email).toMatch(/^aluno\d+@folyo\.test$/)
      expect(b.items?.map((i) => [i.courseId, i.priceCents])).toEqual([
        ['mkt', 3299],
        ['design', 4990],
      ])
      expect((await attemptRow(b.attemptId)).status).toBe('criando')
    })

    test('só a pessoa logada executa (visitante e service_role não)', async () => {
      const uid = await fresh()
      const o = await order(uid)
      fail(await rpc(db, { uid: null }, 'select public.begin_payment_attempt($1, $2) as r', [o.orderId, 'pix']), '42501')
      fail(await runAs('service_role', 'select public.begin_payment_attempt($1, $2) as r', [o.orderId, 'pix']), '42501')
    })

    test('pedido de outra pessoa ou que não existe: pedido inválido', async () => {
      const dona = await fresh()
      const intrusa = await fresh()
      const o = await order(dona)
      fail(await begin(intrusa, o.orderId, 'pix'), 'FA400', /Pedido inválido/)
      fail(await begin(dona, '00000000-0000-4000-8000-000000000000', 'pix'), 'FA400')
      const n = (await db.query<{ n: number }>('select count(*)::int as n from private.payment_attempts where order_id = $1', [o.orderId])).rows[0].n
      expect(n).toBe(0)
    })

    test.each(['boleto', 'CARTAO', '', 'cartao; drop table x'])('forma de pagamento inválida (%s)', async (method) => {
      const uid = await fresh()
      const o = await order(uid)
      fail(await begin(uid, o.orderId, method), 'FA400')
    })

    test('parcelas fora de 1 a 12 são recusadas; no Pix sempre 1', async () => {
      const uid = await fresh()
      const o = await order(uid)
      fail(await begin(uid, o.orderId, 'cartao', 0), 'FC422', /parcelamento/i)
      fail(await begin(uid, o.orderId, 'cartao', 13), 'FC422')
      fail(await begin(uid, o.orderId, 'cartao', -2), 'FC422')
      const pix = ok(await begin(uid, o.orderId, 'pix', 6))
      expect(pix.installments).toBe(1)
    })

    test('pedido pago, cancelado ou expirado não recebe pagamento', async () => {
      const uid = await fresh()
      const o = await order(uid)
      await db.query(`update private.orders set status = 'pago', paid_at = now() where id = $1`, [o.orderId])
      fail(await begin(uid, o.orderId, 'pix'), 'FC422', /já foi pago/)
      await db.query(`update private.orders set status = 'cancelado', paid_at = null where id = $1`, [o.orderId])
      fail(await begin(uid, o.orderId, 'pix'), 'FC422', /não está mais disponível/)
    })

    test('pedido vencido não recebe pagamento', async () => {
      const uid = await fresh()
      const o = await order(uid)
      await db.query(`update private.orders set expires_at = now() - interval '1 minute' where id = $1`, [o.orderId])
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /não está mais disponível/)
    })

    test('quem já possui um dos cursos (liberado depois do pedido) não paga de novo', async () => {
      const uid = await fresh()
      const o = await order(uid, ['mkt', 'ux'])
      await db.query(`insert into public.course_access (user_id, course_id, source) values ($1, 'ux', 'manual')`, [uid])
      fail(await begin(uid, o.orderId, 'pix'), 'FC422', /já possui/)
    })

    test('enquanto há um pagamento em andamento, outro não começa (cobrança dupla)', async () => {
      const uid = await fresh()
      const o = await order(uid)
      ok(await begin(uid, o.orderId, 'cartao', 1))
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /em andamento/)
      fail(await begin(uid, o.orderId, 'pix'), 'FC422', /em andamento/)
    })

    test.each(['processando', 'aguardando_acao'])('cartão %s também barra um novo pagamento até resolver', async (st) => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(b.attemptId, st, st === 'processando' ? 'in_process' : 'pending_challenge'))
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /em andamento/)
      fail(await begin(uid, o.orderId, 'pix'), 'FC422', /em andamento/)
    })

    test('uma tentativa que travou em "criando" libera depois de 2 minutos', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      await db.query(`update private.payment_attempts set open_until = now() - interval '1 second' where id = $1`, [b.attemptId])
      ok(await begin(uid, o.orderId, 'cartao', 1))
    })

    test('Pix em aberto: pedir Pix de novo devolve o MESMO Pix; pedir cartão é barrado', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      ok(await record(b.attemptId, 'aguardando_pix', 'waiting_transfer', 'ORDPIX1', 60, [PIX_CODE, QR, PIX_URL]))
      const again = ok(await begin(uid, o.orderId, 'pix'))
      expect(again.reused).toBe(true)
      expect(again.attemptId).toBe(b.attemptId)
      expect(again.pix?.code).toBe(PIX_CODE)
      expect(again.pix?.ticketUrl).toBe(PIX_URL)
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /em andamento/)
      const n = (await db.query<{ n: number }>('select count(*)::int as n from private.payment_attempts where order_id = $1', [o.orderId])).rows[0].n
      expect(n).toBe(1)
    })

    test('Pix vencido libera um novo pagamento', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      ok(await record(b.attemptId, 'aguardando_pix', 'waiting_transfer', 'ORDPIX2', 60, [PIX_CODE, null, null]))
      await db.query(`update private.payment_attempts set open_until = now() - interval '1 minute' where id = $1`, [b.attemptId])
      const next = ok(await begin(uid, o.orderId, 'pix'))
      expect(next.reused).toBe(false)
      expect(next.attemptId).not.toBe(b.attemptId)
    })

    test('depois de recusado, dá para tentar de novo (até 5 cartões por pedido)', async () => {
      const uid = await fresh()
      const o = await order(uid)
      for (let i = 0; i < 5; i++) await declined(uid, o.orderId)
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /limite de tentativas/)
      // O Pix continua disponível para quem não consegue pagar no cartão.
      const pix = ok(await begin(uid, o.orderId, 'pix'))
      expect(pix.reused).toBe(false)
    })

    test('falha nossa ("erro", Mercado Pago fora do ar) não gasta tentativa', async () => {
      const uid = await fresh()
      const o = await order(uid)
      for (let i = 0; i < 7; i++) {
        const b = ok(await begin(uid, o.orderId, 'cartao', 1))
        ok(await record(b.attemptId, 'erro', null, null))
      }
      ok(await begin(uid, o.orderId, 'cartao', 1))
    })

    test('limite por pessoa: 10 cartões por hora, mesmo trocando de pedido', async () => {
      const uid = await fresh()
      const antigo = await order(uid, ['mkt'])
      // Cada pedido novo cancela o anterior; as tentativas continuam valendo para a pessoa.
      const atual = await order(uid, ['design'])
      for (let i = 0; i < 10; i++) {
        await db.query(`insert into private.payment_attempts (order_id, user_id, method, status, open_until) values ($1, $2, 'cartao', 'recusado', now())`, [antigo.orderId, uid])
      }
      fail(await begin(uid, atual.orderId, 'cartao', 1), 'FC422', /Muitas tentativas/)
      // Tentativas de mais de uma hora atrás não contam.
      await db.query(`update private.payment_attempts set created_at = now() - interval '2 hours' where user_id = $1`, [uid])
      ok(await begin(uid, atual.orderId, 'cartao', 1))
    })

    test('limite geral por pessoa: 20 tentativas por hora (Pix incluído)', async () => {
      const uid = await fresh()
      const antigo = await order(uid, ['mkt'])
      const atual = await order(uid, ['prog'])
      for (let i = 0; i < 20; i++) {
        await db.query(`insert into private.payment_attempts (order_id, user_id, method, status, open_until) values ($1, $2, 'pix', 'expirado', now())`, [antigo.orderId, uid])
      }
      fail(await begin(uid, atual.orderId, 'pix'), 'FC422', /Muitas tentativas/)
    })

    test('o limite de uma pessoa não atrapalha outra', async () => {
      const a = await fresh()
      const b = await fresh()
      const oa = await order(a)
      for (let i = 0; i < 5; i++) await declined(a, oa.orderId)
      fail(await begin(a, oa.orderId, 'cartao', 1), 'FC422')
      const ob = await order(b)
      ok(await begin(b, ob.orderId, 'cartao', 1))
    })
  })

  describe('record_payment_attempt', () => {
    test('só o service_role grava a resposta do Mercado Pago', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      const call = 'select public.record_payment_attempt($1, $2, $3, $4, $5, $6) as r'
      const args = [b.attemptId, 'aprovado', null, 'ORDFORJADO', 'PAYFORJADO', 5]
      fail(await runAs('authenticated', call, args), '42501')
      fail(await runAs('anon', call, args), '42501')
      expect((await attemptRow(b.attemptId)).status).toBe('criando')
    })

    test('grava o Pix (código, QR e link) e libera a tela para mostrá-lo', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      expect(ok(await record(b.attemptId, 'aguardando_pix', 'waiting_transfer', 'ORDPIX3', 60, [PIX_CODE, QR, PIX_URL])).result).toBe('gravado')
      const s = ok(await status(uid, o.orderId))!
      expect(s.attempt).toMatchObject({ method: 'pix', status: 'aguardando_pix', open: true })
      expect(s.attempt?.pix?.code).toBe(PIX_CODE)
    })

    test('grava uma vez só: a segunda resposta para a mesma tentativa é ignorada', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      expect(ok(await record(b.attemptId, 'processando', 'in_process')).result).toBe('gravado')
      expect(ok(await record(b.attemptId, 'recusado', 'rejected_by_issuer')).result).toBe('ignorado')
      expect((await attemptRow(b.attemptId)).status).toBe('processando')
    })

    test('estado final libera na hora; estado em aberto segura pelo prazo informado', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(b.attemptId, 'aguardando_acao', 'pending_challenge', 'ORD3DS1', 40))
      const row = await attemptRow(b.attemptId)
      const minutes = (new Date(row.open_until).getTime() - Date.now()) / 60_000
      expect(minutes).toBeGreaterThan(38)
      expect(minutes).toBeLessThan(41)
    })

    test.each([
      ['endereço fora do Mercado Pago', [PIX_CODE, null, 'https://mercadopago.com.br.evil.com/ticket']],
      ['endereço sem https', [PIX_CODE, null, 'http://www.mercadopago.com.br/ticket']],
      ['código com quebra de linha', [`${PIX_CODE}\n`, null, null]],
      ['código curto demais', ['123', null, null]],
      ['QR que não é base64', [PIX_CODE, '<script>alert(1)</script>', null]],
    ] as const)('recusa %s (a regra da tabela barra)', async (_name, pix) => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      fail(await record(b.attemptId, 'aguardando_pix', null, 'ORDBAD', 60, [pix[0], pix[1], pix[2]]), '23514')
      expect((await attemptRow(b.attemptId)).pix_code).toBeNull()
    })

    test('estado e entradas fora do formato são recusados', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      fail(await record(b.attemptId, 'reembolsado', null, 'ORDX'), 'FA400')
      fail(await record(b.attemptId, 'aprovado; drop', null, 'ORDX'), 'FA400')
      fail(await record(b.attemptId, 'recusado', 'x y', 'ORDX'), '23514')
      fail(await record(b.attemptId, 'recusado', null, 'ORD com espaço'), '23514')
    })

    test('o mesmo pedido do Mercado Pago não vale para duas tentativas', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const a = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(a.attemptId, 'recusado', 'rejected_by_issuer', 'ORDUNICO'))
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      fail(await record(b.attemptId, 'recusado', 'rejected_by_issuer', 'ORDUNICO'), '23505')
    })
  })

  describe('settle_payment_attempt', () => {
    test('só o service_role atualiza o estado', async () => {
      const call = 'select public.settle_payment_attempt($1, $2, $3) as r'
      fail(await runAs('authenticated', call, ['ORD1', 'aprovado', null]), '42501')
      fail(await runAs('anon', call, ['ORD1', 'aprovado', null]), '42501')
    })

    test('pedido do Mercado Pago desconhecido devolve nulo (sem erro)', async () => {
      expect(ok(await settle('ORDNAOEXISTE', 'recusado')).orderId).toBeNull()
    })

    test('devolve o pedido da tentativa e libera um novo pagamento quando o estado é final', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(b.attemptId, 'aguardando_acao', 'pending_challenge', 'ORD3DS2', 40))
      fail(await begin(uid, o.orderId, 'cartao', 1), 'FC422', /em andamento/)

      const r = ok(await settle('ORD3DS2', 'recusado', 'cc_rejected_3ds_challenge'))
      expect(r.orderId).toBe(o.orderId)
      expect((await attemptRow(b.attemptId)).status).toBe('recusado')
      ok(await begin(uid, o.orderId, 'cartao', 1))
    })

    test('aprovado não volta atrás; só pode virar reembolsado; reembolsado é final', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(b.attemptId, 'processando', 'in_process', 'ORDAPROV', 30))
      ok(await settle('ORDAPROV', 'aprovado', 'accredited'))
      expect((await attemptRow(b.attemptId)).status).toBe('aprovado')
      for (const st of ['processando', 'recusado', 'cancelado', 'expirado', 'aguardando_acao']) {
        ok(await settle('ORDAPROV', st))
        expect((await attemptRow(b.attemptId)).status).toBe('aprovado')
      }
      ok(await settle('ORDAPROV', 'reembolsado', 'refunded'))
      expect((await attemptRow(b.attemptId)).status).toBe('reembolsado')
      ok(await settle('ORDAPROV', 'aprovado'))
      expect((await attemptRow(b.attemptId)).status).toBe('reembolsado')
    })

    test('um aviso atrasado de "aprovado" vale mesmo depois de recusado (o dinheiro manda)', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      ok(await record(b.attemptId, 'expirado', 'expired', 'ORDLATE'))
      ok(await settle('ORDLATE', 'aprovado', 'accredited'))
      expect((await attemptRow(b.attemptId)).status).toBe('aprovado')
    })

    test('estado fora da lista ou id fora do formato é recusado', async () => {
      fail(await settle('ORD1', 'erro'), 'FA400')
      fail(await settle('ORD1', 'qualquer coisa'), 'FA400')
      fail(await settle('../etc/passwd', 'recusado'), 'FA400')
    })
  })

  describe('order_status e my_orders', () => {
    test('o Pix em aberto só aparece para o dono do pedido', async () => {
      const dona = await fresh()
      const outra = await fresh()
      const o = await order(dona)
      const b = ok(await begin(dona, o.orderId, 'pix'))
      ok(await record(b.attemptId, 'aguardando_pix', 'waiting_transfer', 'ORDPIX4', 60, [PIX_CODE, null, PIX_URL]))
      expect(ok(await status(outra, o.orderId))).toBeNull()
      expect(ok(await status(dona, o.orderId))?.attempt?.pix?.code).toBe(PIX_CODE)
      const lista = ok(await rpc<{ id: string; payment: { method: string } | null }[]>(db, { uid: outra }, 'select public.my_orders() as r'))
      expect(lista).toEqual([])
    })

    test('Pix vencido deixa de aparecer; recusa aparece com o motivo, sem estar "em aberto"', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'pix'))
      ok(await record(b.attemptId, 'aguardando_pix', 'waiting_transfer', 'ORDPIX5', 60, [PIX_CODE, null, null]))
      await db.query(`update private.payment_attempts set open_until = now() - interval '1 minute' where id = $1`, [b.attemptId])
      const s = ok(await status(uid, o.orderId))!
      expect(s.attempt?.open).toBe(false)
      expect(s.attempt?.pix).toBeNull()

      const c = ok(await begin(uid, o.orderId, 'cartao', 1))
      ok(await record(c.attemptId, 'recusado', 'insufficient_amount', 'ORDREC1'))
      const after = ok(await status(uid, o.orderId))!
      expect(after.attempt).toMatchObject({ method: 'cartao', status: 'recusado', statusDetail: 'insufficient_amount', open: false })
    })

    test('o pedido novo ainda não tem tentativa', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const s = ok(await status(uid, o.orderId))!
      expect(s.attempt).toBeNull()
      expect(s.status).toBe('pendente')
      expect(s.expiresAt).toBeTruthy()
    })

    test('o aluno não lê nem grava a tabela de tentativas', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      for (const sql of [
        'select * from private.payment_attempts',
        `update private.payment_attempts set status = 'aprovado' where id = '${b.attemptId}'`,
        `delete from private.payment_attempts where id = '${b.attemptId}'`,
      ]) {
        await expect(db.transaction(async (tx) => { await tx.exec('set local role authenticated'); await tx.exec(sql) })).rejects.toThrow()
        await expect(db.transaction(async (tx) => { await tx.exec('set local role service_role'); await tx.exec(sql) })).rejects.toThrow()
      }
    })
  })

  describe('payment_attempt_ref', () => {
    const ref = (order: string, user: string | null, role: 'service_role' | 'authenticated' | 'anon' = 'service_role') =>
      runAs<{ providerOrderId: string; status: string } | null>(role, 'select public.payment_attempt_ref($1, $2) as r', [order, user])

    test('só o service_role consulta', async () => {
      const uid = await fresh()
      const o = await order(uid)
      fail(await ref(o.orderId, uid, 'authenticated'), '42501')
      fail(await ref(o.orderId, uid, 'anon'), '42501')
    })

    test('devolve o pedido do Mercado Pago da última tentativa, só para o dono', async () => {
      const dona = await fresh()
      const outra = await fresh()
      const o = await order(dona)
      expect(ok(await ref(o.orderId, dona))).toBeNull()
      const a = ok(await begin(dona, o.orderId, 'cartao', 1))
      expect(ok(await ref(o.orderId, dona))).toBeNull()
      ok(await record(a.attemptId, 'recusado', 'rejected_by_issuer', 'ORDREF1'))
      const b = ok(await begin(dona, o.orderId, 'cartao', 1))
      ok(await record(b.attemptId, 'processando', 'in_process', 'ORDREF2'))
      expect(ok(await ref(o.orderId, dona))).toEqual({ providerOrderId: 'ORDREF2', status: 'processando' })
      expect(ok(await ref(o.orderId, outra))).toBeNull()
      expect(ok(await ref(o.orderId, null))).toBeNull()
    })
  })

  describe('LGPD', () => {
    test('excluir a conta mantém a tentativa, sem dono', async () => {
      const uid = await fresh()
      const o = await order(uid)
      const b = ok(await begin(uid, o.orderId, 'cartao', 1))
      await db.query('delete from auth.users where id = $1', [uid])
      const row = await attemptRow(b.attemptId)
      expect(row.user_id).toBeNull()
    })
  })
})
