import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, rpc, type Db } from './db'

/**
 * Pagamentos (Mercado Pago), rodando a migration DE VERDADE (Postgres em memória) por cima das anteriores.
 * Foco em segurança: o preço sai do banco, só o service_role confirma pagamento, valor e moeda são conferidos,
 * o mesmo pagamento nunca libera duas vezes, estorno tira o acesso e o aluno não lê nem grava pedidos.
 */

const migrations = loadMigrations()

type Order = { orderId: string; totalCents: number; checkoutUrl: string | null; items: { courseId: string; title: string; priceCents: number }[] }
type Applied = { result: string; orderId?: string }

describe.skipIf(!migrations)('pagamentos (SQL)', () => {
  let db: Db
  let ana: string
  let bia: string

  const ok = <T>(r: { ok: true; data: T } | { ok: false; code: string; message: string }): T => {
    if (!r.ok) throw new Error(`${r.code}: ${r.message}`)
    return r.data
  }
  const create = (uid: string, ids: string[]) => rpc<Order>(db, { uid }, 'select public.create_order($1::text[]) as r', [ids])
  const status = (uid: string, order: string) =>
    rpc<{ status: string; totalCents: number; items: { courseId: string }[] } | null>(db, { uid }, 'select public.order_status($1) as r', [order])
  const hasAccess = async (uid: string, course: string) => ok(await rpc<boolean>(db, { uid }, 'select public.has_course_access($1) as r', [course]))

  /** Roda como o service_role (a chave secreta do Supabase), que é quem chama apply_payment no webhook. */
  async function applyAs(role: 'service_role' | 'authenticated' | 'anon', order: string, payment: string, st: string, cents: number, currency = 'BRL') {
    try {
      const data = await db.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`)
        return (await tx.query<{ r: Applied }>('select public.apply_payment($1, $2, $3, $4, $5) as r', [order, payment, st, cents, currency])).rows[0].r
      })
      return { ok: true as const, data }
    } catch (error) {
      const e = error as { code?: string; message?: string }
      return { ok: false as const, code: e.code ?? '', message: e.message ?? String(error) }
    }
  }
  const apply = async (order: string, payment: string, st: string, cents: number, currency = 'BRL') => ok(await applyAs('service_role', order, payment, st, cents, currency))
  const orderRow = async (id: string) =>
    (await db.query<{ status: string; provider_payment_id: string | null; user_id: string | null }>('select status, provider_payment_id, user_id from private.orders where id = $1', [id])).rows[0]
  const accessRows = async (uid: string, course: string) =>
    (await db.query<{ source: string; order_id: string | null }>('select source, order_id from public.course_access where user_id = $1 and course_id = $2', [uid, course])).rows

  async function addCourse(id: string, title: string, price: number | null, status = 'publicado') {
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso.', $3)`, [id, title, status])
    await db.query('update public.courses set price_cents = $2, promo_launch_eligible = true where id = $1', [id, price])
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    await addCourse('mkt', 'Marketing Estratégico', 3299)
    await addCourse('design', 'Design Gráfico', 4990)
    await addCourse('prog', 'Programação', 6990)
    await addCourse('gratis', 'Curso grátis', null)
    await addCourse('rascunho', 'Em rascunho', 1000, 'rascunho')
    await addCourse('extra1', 'Extra 1', 1500)
    await addCourse('extra2', 'Extra 2', 1600)
    await addCourse('extra3', 'Extra 3', 1700)
    await addCourse('extra4', 'Extra 4', 1800)
    await addCourse('extra5', 'Extra 5', 1900)
  }, 120_000)

  describe('create_order', () => {
    test('o preço sai do banco e o pedido guarda a foto dos itens', async () => {
      const o = ok(await create(ana, ['mkt', 'design']))
      expect(o.totalCents).toBe(8289)
      expect(o.items.map((i) => [i.courseId, i.priceCents])).toEqual([
        ['mkt', 3299],
        ['design', 4990],
      ])
      expect(o.checkoutUrl).toBeNull()
      expect((await orderRow(o.orderId)).status).toBe('pendente')
    })

    test('curso gratuito, em rascunho ou inexistente não entra no pedido', async () => {
      const o = ok(await create(ana, ['mkt', 'gratis', 'rascunho', 'nao-existe']))
      expect(o.items.map((i) => i.courseId)).toEqual(['mkt'])
      expect(o.totalCents).toBe(3299)
    })

    test('só curso fora de venda: recusa com mensagem para a tela', async () => {
      const r = await create(ana, ['gratis', 'rascunho'])
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.code).toBe('FC422')
        expect(r.message).toBe('Nenhum curso do carrinho está à venda.')
      }
    })

    test('pedido vazio e id fora do formato são recusados', async () => {
      expect((await create(ana, [])).ok).toBe(false)
      expect((await create(ana, ["mkt'; drop table x;--"])).ok).toBe(false)
    })

    test('sem login (anon) não cria pedido', async () => {
      const r = await rpc(db, { uid: null }, 'select public.create_order($1::text[]) as r', [['mkt']])
      expect(r.ok).toBe(false)
    })

    test('o mesmo carrinho reaproveita o pedido em aberto (não cria outro)', async () => {
      const a = ok(await create(bia, ['design']))
      const b = ok(await create(bia, ['design']))
      expect(b.orderId).toBe(a.orderId)
    })

    test('carrinho diferente cancela o pedido aberto anterior', async () => {
      const a = ok(await create(bia, ['prog']))
      const b = ok(await create(bia, ['prog', 'mkt']))
      expect(b.orderId).not.toBe(a.orderId)
      expect((await orderRow(a.orderId)).status).toBe('cancelado')
      expect((await orderRow(b.orderId)).status).toBe('pendente')
    })

    test('se o preço mudou, o pedido novo usa o preço de agora', async () => {
      await addCourse('muda', 'Preço que muda', 1000)
      const a = ok(await create(ana, ['muda']))
      await db.query(`update public.courses set price_cents = 2000 where id = 'muda'`)
      const b = ok(await create(ana, ['muda']))
      expect(b.orderId).not.toBe(a.orderId)
      expect(b.totalCents).toBe(2000)
      expect(a.totalCents).toBe(1000)
    })
  })

  describe('order_status', () => {
    test('o link do Checkout Pro não existe mais (o pagamento é dentro do site)', async () => {
      const o = ok(await create(ana, ['extra1']))
      const r = await rpc(db, { uid: ana }, 'select public.attach_order_checkout($1, $2, $3) as r', [o.orderId, 'pref-1', 'https://www.mercadopago.com.br/x'])
      expect(r.ok).toBe(false)
      // 42883 = a função não existe.
      if (!r.ok) expect(r.code).toBe('42883')
      expect(o.checkoutUrl).toBeNull()
    })

    test('outra conta não vê o status do pedido; o dono vê status, itens e prazo', async () => {
      const o = ok(await create(ana, ['extra3']))
      expect(ok(await status(bia, o.orderId))).toBeNull()
      const mine = ok(await status(ana, o.orderId))
      expect(mine?.status).toBe('pendente')
      expect(mine?.items.map((i) => i.courseId)).toEqual(['extra3'])
    })

    test('o aluno não lê nem grava as tabelas de pedido', async () => {
      const o = ok(await create(ana, ['extra3']))
      await expect(as(db, { uid: ana }, (tx) => tx.query('select * from private.orders'))).rejects.toThrow()
      await expect(as(db, { uid: ana }, (tx) => tx.query(`update private.orders set status = 'pago' where id = $1`, [o.orderId]))).rejects.toThrow()
      await expect(as(db, { uid: ana }, (tx) => tx.query(`insert into public.course_access (user_id, course_id, source) values ($1, 'prog', 'compra')`, [ana]))).rejects.toThrow()
    })
  })

  describe('apply_payment', () => {
    test('só o service_role executa (aluno e visitante não)', async () => {
      const o = ok(await create(ana, ['prog']))
      for (const role of ['authenticated', 'anon'] as const) {
        const r = await applyAs(role, o.orderId, 'p-perm', 'approved', 6990)
        expect(r.ok).toBe(false)
        if (!r.ok) expect(r.code).toBe('42501')
      }
      expect(await hasAccess(ana, 'prog')).toBe(false)
    })

    test('pagamento aprovado com o valor certo libera o curso e fecha o pedido', async () => {
      const o = ok(await create(ana, ['design', 'extra4']))
      expect(await hasAccess(ana, 'design')).toBe(false)
      const r = await apply(o.orderId, 'pay-100', 'approved', o.totalCents)
      expect(r.result).toBe('liberado')
      expect(await hasAccess(ana, 'design')).toBe(true)
      expect(await hasAccess(ana, 'extra4')).toBe(true)
      expect(await accessRows(ana, 'design')).toEqual([{ source: 'compra', order_id: o.orderId }])
      expect(await orderRow(o.orderId)).toMatchObject({ status: 'pago', provider_payment_id: 'pay-100' })
      expect(ok(await status(ana, o.orderId))?.status).toBe('pago')
    })

    test('o mesmo pagamento de novo não muda nada (idempotente)', async () => {
      const o = ok(await create(ana, ['extra5']))
      expect((await apply(o.orderId, 'pay-200', 'approved', o.totalCents)).result).toBe('liberado')
      expect((await apply(o.orderId, 'pay-200', 'approved', o.totalCents)).result).toBe('ja_processado')
      expect(await accessRows(ana, 'extra5')).toHaveLength(1)
    })

    test('valor diferente do pedido não libera nada', async () => {
      const o = ok(await create(bia, ['mkt']))
      expect((await apply(o.orderId, 'pay-300', 'approved', 1)).result).toBe('valor_divergente')
      expect((await apply(o.orderId, 'pay-301', 'approved', o.totalCents - 1)).result).toBe('valor_divergente')
      expect(await hasAccess(bia, 'mkt')).toBe(false)
      expect((await orderRow(o.orderId)).status).toBe('pendente')
    })

    test('moeda diferente de BRL não libera nada', async () => {
      const o = ok(await create(bia, ['mkt']))
      expect((await apply(o.orderId, 'pay-310', 'approved', o.totalCents, 'USD')).result).toBe('valor_divergente')
      expect((await apply(o.orderId, 'pay-311', 'approved', o.totalCents, '')).result).toBe('valor_divergente')
      expect(await hasAccess(bia, 'mkt')).toBe(false)
    })

    test('outro pagamento para um pedido já pago é registrado como duplicado e não libera de novo', async () => {
      const o = ok(await create(bia, ['mkt']))
      expect((await apply(o.orderId, 'pay-400', 'approved', o.totalCents)).result).toBe('liberado')
      expect((await apply(o.orderId, 'pay-401', 'approved', o.totalCents)).result).toBe('pagamento_duplicado')
      expect((await orderRow(o.orderId)).provider_payment_id).toBe('pay-400')
      const events = await db.query<{ result: string }>(`select result from private.payment_events where provider_payment_id = 'pay-401'`)
      expect(events.rows.map((e) => e.result)).toEqual(['pagamento_duplicado'])
    })

    test('pagamento pendente, em análise ou recusado não libera', async () => {
      const o = ok(await create(ana, ['rascunho', 'prog']))
      for (const st of ['pending', 'in_process', 'rejected', 'cancelled']) {
        expect((await apply(o.orderId, 'pay-500', st, o.totalCents)).result).toBe('sem_efeito')
      }
      expect(await hasAccess(ana, 'prog')).toBe(false)
    })

    test('pedido que não existe não dá erro (a notificação não fica sendo reenviada)', async () => {
      const r = await apply('00000000-0000-0000-0000-000000000000', 'pay-600', 'approved', 100)
      expect(r.result).toBe('pedido_inexistente')
    })

    test('entradas fora do formato são recusadas', async () => {
      const o = ok(await create(ana, ['prog']))
      for (const [pay, st, cents] of [
        ["x'; drop table private.orders;--", 'approved', 100],
        ['pay-700', 'APPROVED; select 1', 100],
        ['pay-701', 'approved', -5],
      ] as const) {
        const r = await applyAs('service_role', o.orderId, pay, st, cents)
        expect(r.ok).toBe(false)
      }
    })

    test('pagamento aprovado depois que o pedido expirou ou foi cancelado ainda libera (o dinheiro entrou)', async () => {
      await addCourse('tarde', 'Pagou tarde', 1234)
      const o = ok(await create(bia, ['tarde']))
      await db.query(`update private.orders set expires_at = now() - interval '1 hour' where id = $1`, [o.orderId])
      // Criar de novo marca o antigo como expirado e abre outro pedido.
      const novo = ok(await create(bia, ['tarde']))
      expect(novo.orderId).not.toBe(o.orderId)
      expect((await orderRow(o.orderId)).status).toBe('expirado')
      expect((await apply(o.orderId, 'pay-800', 'approved', o.totalCents)).result).toBe('liberado')
      expect(await hasAccess(bia, 'tarde')).toBe(true)
    })

    test('estorno do pagamento que fechou o pedido tira o acesso; estorno de outro pagamento não', async () => {
      await addCourse('estorno', 'Vai ser estornado', 2500)
      const o = ok(await create(ana, ['estorno']))
      await apply(o.orderId, 'pay-900', 'approved', o.totalCents)
      expect(await hasAccess(ana, 'estorno')).toBe(true)
      expect((await apply(o.orderId, 'pay-OUTRO', 'refunded', o.totalCents)).result).toBe('ignorado')
      expect(await hasAccess(ana, 'estorno')).toBe(true)
      expect((await apply(o.orderId, 'pay-900', 'charged_back', o.totalCents)).result).toBe('revogado')
      expect(await hasAccess(ana, 'estorno')).toBe(false)
      expect((await orderRow(o.orderId)).status).toBe('reembolsado')
      // Notificação atrasada de "aprovado" depois do estorno não devolve o acesso.
      expect((await apply(o.orderId, 'pay-900', 'approved', o.totalCents)).result).toBe('ignorado_reembolsado')
      expect(await hasAccess(ana, 'estorno')).toBe(false)
    })

    test('o estorno tira só o acesso daquele pedido', async () => {
      await addCourse('a1', 'Curso A1', 1100)
      await addCourse('a2', 'Curso A2', 1200)
      const o1 = ok(await create(bia, ['a1']))
      await apply(o1.orderId, 'pay-1000', 'approved', o1.totalCents)
      const o2 = ok(await create(bia, ['a2']))
      await apply(o2.orderId, 'pay-1001', 'approved', o2.totalCents)
      await apply(o1.orderId, 'pay-1000', 'refunded', o1.totalCents)
      expect(await hasAccess(bia, 'a1')).toBe(false)
      expect(await hasAccess(bia, 'a2')).toBe(true)
    })

    test('quem já possui o curso não consegue pedir de novo; liberação manual também conta', async () => {
      const r = await create(ana, ['design'])
      expect(r.ok).toBe(false)
      await addCourse('manual', 'Manual', 3000)
      await db.query(`insert into public.course_access (user_id, course_id, source) values ($1, 'manual', 'manual')`, [bia])
      expect((await create(bia, ['manual'])).ok).toBe(false)
    })
  })

  describe('pré-acesso, cupom e LGPD', () => {
    test('quem tem pré-acesso do cupom PODE comprar o curso, e a compra convive com o pré-acesso', async () => {
      await addCourse('pre', 'Com pré-acesso', 5000)
      const red = await rpc(db, { uid: ana }, 'select public.redeem_launch_coupon($1::text[], $2) as r', [['pre'], 'LANCAMENTO'])
      ok(red)
      expect(await hasAccess(ana, 'pre')).toBe(true)
      const o = ok(await create(ana, ['pre']))
      expect(o.totalCents).toBe(5000)
      await apply(o.orderId, 'pay-1100', 'approved', o.totalCents)
      expect((await accessRows(ana, 'pre')).map((a) => a.source).sort()).toEqual(['compra', 'cupom'])
      // Desligar a promoção encerra o pré-acesso, mas a compra continua valendo.
      await db.query(`update private.coupons set active = false where code = 'LANCAMENTO'`)
      expect(await hasAccess(ana, 'pre')).toBe(true)
      await db.query(`update private.coupons set active = true where code = 'LANCAMENTO'`)
    })

    test('cupom com menos de 100% não libera pré-acesso de graça', async () => {
      await addCourse('metade', 'Cupom parcial', 4000)
      await db.query(`insert into private.coupons (code, percent_off, access_days) values ('METADE', 50, 30)`)
      const r = await rpc(db, { uid: bia }, 'select public.redeem_launch_coupon($1::text[], $2) as r', [['metade'], 'METADE'])
      expect(r.ok).toBe(false)
      expect(await hasAccess(bia, 'metade')).toBe(false)
    })

    test('"baixar meus dados" inclui os pedidos', async () => {
      const exported = ok(await rpc<{ pedidos: { status: string; cursos: { curso: string }[] }[] }>(db, { uid: ana }, 'select public.export_my_data() as r'))
      expect(exported.pedidos.length).toBeGreaterThan(0)
      expect(exported.pedidos.some((p) => p.status === 'pago')).toBe(true)
      const other = ok(await rpc<{ pedidos: unknown[] }>(db, { uid: await createUser(db, 'novo@folyo.test') }, 'select public.export_my_data() as r'))
      expect(other.pedidos).toEqual([])
    })

    test('excluir a conta mantém o registro financeiro, sem dono', async () => {
      await addCourse('conta', 'Conta que será excluída', 1500)
      const gone = await createUser(db, 'sairei@folyo.test')
      const o = ok(await create(gone, ['conta']))
      await apply(o.orderId, 'pay-1200', 'approved', o.totalCents)
      await db.query('delete from auth.users where id = $1', [gone])
      expect(await orderRow(o.orderId)).toMatchObject({ status: 'pago', user_id: null })
      expect((await accessRows(gone, 'conta'))).toEqual([])
    })
  })
})
