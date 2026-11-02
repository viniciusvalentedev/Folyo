import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * Estorno pelo painel, rodando as migrations DE VERDADE (Postgres em memória).
 * Foco: só administrador ou acima (com a verificação em duas etapas) lista compras de um aluno e pede o estorno; o pedido
 * precisa estar pago pelo site; o pedido do estorno fica no histórico do painel; e a função nunca tira acesso a curso
 * (quem tira é apply_payment, só service_role, depois de o servidor ler o estorno no Mercado Pago).
 */

const migrations = loadMigrations()

type AdminOrder = {
  id: string
  status: string
  totalCents: number
  paidAt: string | null
  refundedAt: string | null
  refundable: boolean
  items: { courseId: string; title: string; priceCents: number }[]
}
type Begun = { orderId: string; providerOrderId: string; totalCents: number }
type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }

describe.skipIf(!migrations)('estorno pelo painel (SQL)', () => {
  let db: Db
  let boss: string
  let editor: string
  let plain: string
  let seq = 0
  let payment = 7000

  const admin = { aal: 'aal2' as const }
  const ok = <T>(r: Result<T>): T => {
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`)
    return r.data
  }
  const listFor = (session: { uid: string | null; aal?: 'aal1' | 'aal2' }, student: string) =>
    rpc<AdminOrder[]>(db, session, 'select public.admin_user_orders($1) as r', [student])
  const begin = (session: { uid: string | null; aal?: 'aal1' | 'aal2' }, order: string, reason = '') =>
    rpc<Begun>(db, session, 'select public.admin_refund_begin($1, $2) as r', [order, reason])

  /** Executa como service_role (o webhook), que é quem aplica o pagamento. */
  async function asService<T>(sql: string, params: unknown[] = []) {
    return db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      return (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T
    })
  }

  async function fresh() {
    return createUser(db, `aluno${++seq}@folyo.test`)
  }

  /** Pedido pago pelo caminho real (apply_payment) com a tentativa do Mercado Pago gravada. */
  async function paidOrder(uid: string, ids: string[], withAttempt = true) {
    const created = ok(await rpc<{ orderId: string; totalCents: number }>(db, { uid }, 'select public.create_order($1::text[]) as r', [ids]))
    const paymentId = `${payment++}`
    const applied = await asService<{ result: string }>('select public.apply_payment($1, $2, $3, $4, $5) as r', [created.orderId, paymentId, 'approved', created.totalCents, 'BRL'])
    expect(applied.result).toBe('liberado')
    const providerOrderId = `ORD${paymentId}`
    if (withAttempt) {
      await db.query(
        `insert into private.payment_attempts (order_id, user_id, method, status, provider_order_id, provider_payment_id, open_until)
         values ($1, $2, 'pix', 'aprovado', $3, $4, now())`,
        [created.orderId, uid, providerOrderId, paymentId],
      )
    }
    return { ...created, paymentId, providerOrderId }
  }

  async function addCourse(id: string, title: string, price: number) {
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso.', 'publicado')`, [id, title])
    await db.query('update public.courses set price_cents = $2, promo_launch_eligible = true where id = $1', [id, price])
  }

  const auditRows = async (target: string) =>
    (await db.query<{ action: string; detail: string }>(`select action, detail from private.admin_audit where action = 'pedido.estorno' and target_id = $1`, [target])).rows

  beforeAll(async () => {
    db = await createDb(migrations!)
    boss = await createUser(db, 'chefe@folyo.test')
    editor = await createUser(db, 'editora@folyo.test')
    plain = await createUser(db, 'aluna@folyo.test')
    await setRole(db, boss, 'admin')
    await setRole(db, editor, 'editor')
    await addCourse('mkt', 'Marketing Estratégico', 3299)
    await addCourse('design', 'Design Gráfico', 4990)
    await addCourse('prog', 'Programação', 6990)
    await addCourse('ux', 'UX Writing', 2500)
    await addCourse('dados', 'Análise de Dados', 5500)
  }, 120_000)

  describe('quem pode', () => {
    test('aluno comum e editor não listam compras nem pedem estorno', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['mkt'])
      for (const who of [plain, editor]) {
        expect((await listFor({ uid: who, ...admin }, student)).ok, 'lista').toBe(false)
        expect((await begin({ uid: who, ...admin }, o.orderId)).ok, 'estorno').toBe(false)
      }
      expect(await auditRows(student)).toEqual([])
    })

    test('administrador SEM a verificação em duas etapas também não', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['design'])
      expect((await listFor({ uid: boss, aal: 'aal1' }, student)).ok).toBe(false)
      expect((await begin({ uid: boss, aal: 'aal1' }, o.orderId)).ok).toBe(false)
      expect(await auditRows(student)).toEqual([])
    })

    test('sem login (anon) e service_role não executam', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['prog'])
      expect((await begin({ uid: null }, o.orderId)).ok).toBe(false)
      for (const sql of ['select public.admin_user_orders($1) as r', 'select public.admin_refund_begin($1, $2) as r']) {
        await expect(asService(sql, sql.includes('refund') ? [o.orderId, ''] : [student])).rejects.toThrow()
      }
    })
  })

  describe('admin_user_orders', () => {
    test('lista as compras pagas do aluno, com itens e se dá para estornar', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['mkt', 'design'])
      const list = ok(await listFor({ uid: boss, ...admin }, student))
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: o.orderId, status: 'pago', totalCents: 8289, refundable: true, refundedAt: null })
      expect(list[0].items.map((i) => i.courseId)).toEqual(['mkt', 'design'])
    })

    test('só pagos e estornados: pedido em aberto não aparece; aluno sem compras recebe lista vazia', async () => {
      const student = await fresh()
      ok(await rpc(db, { uid: student }, 'select public.create_order($1::text[]) as r', [['ux']]))
      expect(ok(await listFor({ uid: boss, ...admin }, student))).toEqual([])
    })

    test('pedido pago por outro meio (sem pagamento do Mercado Pago gravado) não é "estornável"', async () => {
      const student = await fresh()
      const created = ok(await rpc<{ orderId: string }>(db, { uid: student }, 'select public.create_order($1::text[]) as r', [['dados']]))
      await db.query(`update private.orders set status = 'pago', paid_at = now() where id = $1`, [created.orderId])
      const list = ok(await listFor({ uid: boss, ...admin }, student))
      expect(list[0].refundable).toBe(false)
    })

    test('id nulo é recusado', async () => {
      const r = await rpc(db, { uid: boss, ...admin }, 'select public.admin_user_orders(null) as r')
      expect(r.ok).toBe(false)
    })
  })

  describe('admin_refund_begin', () => {
    test('devolve a ordem do Mercado Pago, registra quem pediu e por quê, e NÃO mexe no pedido nem no acesso', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['mkt'])
      const r = ok(await begin({ uid: boss, ...admin }, o.orderId, '  Pediu o dinheiro de volta.  '))
      expect(r).toMatchObject({ orderId: o.orderId, providerOrderId: o.providerOrderId, totalCents: 3299 })

      const rows = await auditRows(student)
      expect(rows).toHaveLength(1)
      expect(rows[0].detail).toContain(o.orderId.slice(0, 8).toUpperCase())
      expect(rows[0].detail).toContain('R$ 32,99')
      expect(rows[0].detail).toContain('Pediu o dinheiro de volta.')

      // Nada foi estornado ou revogado aqui: o pedido continua pago e o acesso continua.
      const order = (await db.query<{ status: string }>('select status from private.orders where id = $1', [o.orderId])).rows[0]
      expect(order.status).toBe('pago')
      const access = await db.query('select 1 from public.course_access where user_id = $1 and course_id = $2', [student, 'mkt'])
      expect(access.rows).toHaveLength(1)
    })

    test('motivo grande demais é cortado em 300 caracteres no histórico', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['design'])
      ok(await begin({ uid: boss, ...admin }, o.orderId, 'x'.repeat(500)))
      const [row] = await auditRows(student)
      expect(row.detail.length).toBeLessThan(400)
      expect(row.detail).not.toContain('x'.repeat(301))
    })

    test('pedido em aberto, inexistente ou sem a ordem do Mercado Pago: erro com mensagem pronta', async () => {
      const student = await fresh()
      const open = ok(await rpc<{ orderId: string }>(db, { uid: student }, 'select public.create_order($1::text[]) as r', [['prog']]))
      const a = await begin({ uid: boss, ...admin }, open.orderId)
      expect(a).toMatchObject({ ok: false, code: 'FA400' })

      const b = await begin({ uid: boss, ...admin }, '11111111-2222-4333-8444-555555555555')
      expect(b).toMatchObject({ ok: false, code: 'FA404' })

      const noAttempt = await paidOrder(await fresh(), ['ux'], false)
      const c = await begin({ uid: boss, ...admin }, noAttempt.orderId)
      expect(c).toMatchObject({ ok: false, code: 'FA404' })
      expect(c.ok ? '' : c.message).toContain('Mercado Pago')
    })

    test('depois de estornado (apply_payment como o webhook faz): lista como estornado, sem botão, e não deixa pedir de novo', async () => {
      const student = await fresh()
      const o = await paidOrder(student, ['dados'])
      ok(await begin({ uid: boss, ...admin }, o.orderId, 'teste'))
      const applied = await asService<{ result: string }>('select public.apply_payment($1, $2, $3, $4, $5) as r', [o.orderId, o.paymentId, 'refunded', o.totalCents, 'BRL'])
      expect(applied.result).toBe('revogado')

      const list = ok(await listFor({ uid: boss, ...admin }, student))
      expect(list[0]).toMatchObject({ id: o.orderId, status: 'reembolsado', refundable: false })
      expect(list[0].refundedAt).not.toBeNull()
      const again = await begin({ uid: boss, ...admin }, o.orderId)
      expect(again).toMatchObject({ ok: false, code: 'FA409' })
    })

    test('id nulo é recusado', async () => {
      const r = await rpc(db, { uid: boss, ...admin }, 'select public.admin_refund_begin(null, $1) as r', [''])
      expect(r.ok).toBe(false)
    })
  })
})
