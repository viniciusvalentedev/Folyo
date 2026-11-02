import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, type Db } from './db'

/**
 * Minhas compras e recibo por e-mail, rodando as migrations DE VERDADE (Postgres em memória).
 * Foco: o aluno só lê as PRÓPRIAS compras; o recibo é reservado uma única vez por pedido pago e só o service_role mexe nisso.
 */

const migrations = loadMigrations()

type Order = { orderId: string; totalCents: number; checkoutUrl: string | null; items: { courseId: string; title: string; priceCents: number }[] }
type MyOrder = {
  id: string
  status: string
  totalCents: number
  paidAt: string | null
  refundedAt: string | null
  checkoutUrl: string | null
  items: { courseId: string; title: string; priceCents: number }[]
}
type Receipt = { orderId: string; email: string; name: string | null; totalCents: number; items: { courseId: string; title: string; priceCents: number }[] } | null

const URL_OK = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123-abc'

describe.skipIf(!migrations)('compras e recibo (SQL)', () => {
  let db: Db
  let ana: string
  let bia: string
  let payment = 1000

  const ok = <T>(r: { ok: true; data: T } | { ok: false; code: string; message: string }): T => {
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`)
    return r.data
  }
  const create = async (uid: string, ids: string[]) => ok(await rpc<Order>(db, { uid }, 'select public.create_order($1::text[]) as r', [ids]))
  const mine = async (uid: string) => ok(await rpc<MyOrder[]>(db, { uid }, 'select public.my_orders() as r'))

  /** Roda como um papel da API (o webhook usa o service_role). */
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
  const claim = async (order: string) => ok(await runAs<Receipt>('service_role', 'select public.claim_order_receipt($1) as r', [order]))
  const finish = async (order: string, sent: boolean) => ok(await runAs<null>('service_role', 'select public.finish_order_receipt($1, $2) as r', [order, sent]))

  /** Cria um pedido e o paga pelo caminho real (apply_payment, como o webhook). */
  async function paidOrder(uid: string, ids: string[]) {
    const o = await create(uid, ids)
    const id = `${payment++}`
    const applied = ok(await runAs<{ result: string }>('service_role', 'select public.apply_payment($1, $2, $3, $4, $5) as r', [o.orderId, id, 'approved', o.totalCents, 'BRL']))
    expect(applied.result).toBe('liberado')
    return { ...o, paymentId: id }
  }

  let seq = 0
  /** Uma conta nova por teste: quem já comprou um curso não pode comprá-lo de novo. */
  async function fresh(name?: string) {
    const uid = await createUser(db, `aluno${++seq}@folyo.test`)
    if (name) await db.query('update public.profiles set name = $2 where id = $1', [uid, name])
    return uid
  }

  async function addCourse(id: string, title: string, price: number) {
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso.', 'publicado')`, [id, title])
    await db.query('update public.courses set price_cents = $2, promo_launch_eligible = true where id = $1', [id, price])
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    await db.query(`update public.profiles set name = 'Ana Souza' where id = $1`, [ana])
    await addCourse('mkt', 'Marketing Estratégico', 3299)
    await addCourse('design', 'Design Gráfico', 4990)
    await addCourse('prog', 'Programação', 6990)
    await addCourse('ux', 'UX Writing', 2500)
  }, 120_000)

  describe('my_orders', () => {
    test('quem não comprou nada recebe uma lista vazia', async () => {
      expect(await mine(bia)).toEqual([])
    })

    test('sem login não lê nada', async () => {
      const r = await rpc(db, { uid: null }, 'select public.my_orders() as r')
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.code).toBe('42501')
    })

    test('pedido pago aparece com a foto dos itens e sem link de pagamento', async () => {
      const o = await paidOrder(ana, ['mkt', 'design'])
      const list = await mine(ana)
      const found = list.find((x) => x.id === o.orderId)!
      expect(found.status).toBe('pago')
      expect(found.totalCents).toBe(8289)
      expect(found.paidAt).not.toBeNull()
      expect(found.checkoutUrl).toBeNull()
      expect(found.items.map((i) => [i.courseId, i.title, i.priceCents])).toEqual([
        ['mkt', 'Marketing Estratégico', 3299],
        ['design', 'Design Gráfico', 4990],
      ])
    })

    test('uma pessoa nunca vê a compra da outra', async () => {
      expect(await mine(bia)).toEqual([])
      expect((await mine(ana)).length).toBeGreaterThan(0)
    })

    test('pedido em aberto aparece com o link para continuar, e some quando vence', async () => {
      const o = await create(ana, ['prog'])
      ok(await rpc(db, { uid: ana }, 'select public.attach_order_checkout($1, $2, $3) as r', [o.orderId, 'pref-1', URL_OK]))
      const open = (await mine(ana)).find((x) => x.id === o.orderId)!
      expect(open.status).toBe('pendente')
      expect(open.checkoutUrl).toBe(URL_OK)

      await db.query(`update private.orders set expires_at = now() - interval '1 minute' where id = $1`, [o.orderId])
      expect((await mine(ana)).some((x) => x.id === o.orderId)).toBe(false)
    })

    test('pedido substituído por outro (cancelado) não aparece', async () => {
      const first = await create(bia, ['mkt'])
      const second = await create(bia, ['design'])
      const ids = (await mine(bia)).map((x) => x.id)
      expect(ids).toContain(second.orderId)
      expect(ids).not.toContain(first.orderId)
    })

    test('estorno: o pedido continua na lista, como estornado', async () => {
      const o = await paidOrder(bia, ['ux'])
      const r = ok(await runAs<{ result: string }>('service_role', 'select public.apply_payment($1, $2, $3, $4, $5) as r', [o.orderId, o.paymentId, 'refunded', o.totalCents, 'BRL']))
      expect(r.result).toBe('revogado')
      const found = (await mine(bia)).find((x) => x.id === o.orderId)!
      expect(found.status).toBe('reembolsado')
      expect(found.refundedAt).not.toBeNull()
    })

    test('a lista traz do mais novo para o mais antigo', async () => {
      const list = await mine(ana)
      const times = list.map((x) => x.id)
      const rows = (await db.query<{ id: string }>('select id from private.orders where user_id = $1 order by created_at desc', [ana])).rows.map((r) => r.id)
      expect(times).toEqual(rows.filter((id) => times.includes(id)))
    })
  })

  describe('recibo por e-mail', () => {
    test('só o service_role reserva ou fecha o recibo', async () => {
      const o = await paidOrder(await fresh(), ['ux'])
      for (const role of ['anon', 'authenticated'] as const) {
        const a = await runAs(role, 'select public.claim_order_receipt($1) as r', [o.orderId])
        expect(a.ok).toBe(false)
        if (!a.ok) expect(a.code).toBe('42501')
        const b = await runAs(role, 'select public.finish_order_receipt($1, true) as r', [o.orderId])
        expect(b.ok).toBe(false)
        if (!b.ok) expect(b.code).toBe('42501')
      }
      // Nada mudou no pedido.
      const row = (await db.query<{ receipt_claimed_at: string | null; receipt_sent_at: string | null }>('select receipt_claimed_at, receipt_sent_at from private.orders where id = $1', [o.orderId])).rows[0]
      expect(row.receipt_claimed_at).toBeNull()
      expect(row.receipt_sent_at).toBeNull()
    })

    test('pedido que não está pago não gera recibo', async () => {
      const o = await create(await fresh(), ['prog', 'mkt'])
      expect(await claim(o.orderId)).toBeNull()
      expect(await claim('00000000-0000-4000-8000-000000000000')).toBeNull()
    })

    test('pedido pago: devolve e-mail, nome, itens e total', async () => {
      const uid = await fresh('Ana Souza')
      const o = await paidOrder(uid, ['design', 'prog'])
      const r = (await claim(o.orderId))!
      expect(r.orderId).toBe(o.orderId)
      expect(r.email).toMatch(/^aluno\d+@folyo\.test$/)
      expect(r.name).toBe('Ana Souza')
      expect(r.totalCents).toBe(11980)
      expect(r.items.map((i) => i.courseId)).toEqual(['design', 'prog'])
    })

    test('a reserva vale uma vez: o segundo aviso não manda de novo', async () => {
      const o = await paidOrder(await fresh(), ['mkt'])
      expect(await claim(o.orderId)).not.toBeNull()
      expect(await claim(o.orderId)).toBeNull()
    })

    test('enviado = nunca mais; falhou = libera para tentar de novo', async () => {
      const o = await paidOrder(await fresh(), ['prog'])
      expect(await claim(o.orderId)).not.toBeNull()
      await finish(o.orderId, false)
      expect(await claim(o.orderId)).not.toBeNull()
      await finish(o.orderId, true)
      expect(await claim(o.orderId)).toBeNull()
      // Depois de enviado, uma "falha" tardia não reabre o recibo.
      await finish(o.orderId, false)
      expect(await claim(o.orderId)).toBeNull()
    })

    test('reserva travada há mais de 10 minutos pode ser refeita', async () => {
      const o = await paidOrder(await fresh(), ['ux', 'mkt'])
      expect(await claim(o.orderId)).not.toBeNull()
      await db.query(`update private.orders set receipt_claimed_at = now() - interval '11 minutes' where id = $1`, [o.orderId])
      expect(await claim(o.orderId)).not.toBeNull()
    })

    test('pedido estornado não gera recibo novo', async () => {
      const o = await paidOrder(await fresh(), ['design'])
      ok(await runAs('service_role', 'select public.apply_payment($1, $2, $3, $4, $5) as r', [o.orderId, o.paymentId, 'charged_back', o.totalCents, 'BRL']))
      expect(await claim(o.orderId)).toBeNull()
    })

    test('conta excluída (pedido sem dono) não gera recibo', async () => {
      const o = await paidOrder(await fresh(), ['ux'])
      await db.query('update private.orders set user_id = null where id = $1', [o.orderId])
      expect(await claim(o.orderId)).toBeNull()
    })
  })
})
