import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * Cupom de lançamento, carrinho e pré-acesso, rodando a migration DE VERDADE (Postgres em memória)
 * por cima de todas as anteriores. Cobre as regras de preço e, principalmente, as de segurança:
 * o aluno não grava liberações, não lê cupons, não renova o mês e não abre aula paga sem acesso.
 */

const migrations = loadMigrations()

type Quote = {
  items: { courseId: string; priceCents: number; eligible: boolean; discountCents: number; finalCents: number }[]
  dropped: { courseId: string; reason: string }[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  coupon: string | null
  couponError: string | null
  percentOff: number
  accessDays: number | null
}
type Redeem = { courses: { id: string; title: string; expiresAt: string }[]; leftoverIds: string[]; droppedIds: string[] }

const ENDED = 'A promoção de lançamento foi encerrada.'
const INVALID = 'Este cupom não existe ou não é válido.'

describe.skipIf(!migrations)('cupom de lançamento (SQL)', () => {
  let db: Db
  let owner: string
  let ana: string
  let bia: string
  let caio: string
  const OWNER = () => ({ uid: owner, aal: 'aal2' as const })

  const quote = (uid: string, ids: string[], code: string | null = null) =>
    rpc<Quote>(db, { uid }, 'select public.quote_cart($1::text[], $2) as r', [ids, code])
  const redeem = (uid: string, ids: string[], code: string | null) =>
    rpc<Redeem>(db, { uid }, 'select public.redeem_launch_coupon($1::text[], $2) as r', [ids, code])
  const hasAccess = async (uid: string, course: string) => {
    const r = await rpc<boolean>(db, { uid }, 'select public.has_course_access($1) as r', [course])
    if (!r.ok) throw new Error(r.message)
    return r.data
  }
  const ok = <T>(r: { ok: true; data: T } | { ok: false; message: string }): T => {
    if (!r.ok) throw new Error(r.message)
    return r.data
  }

  async function addCourse(id: string, title: string, status = 'publicado') {
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso para o teste.', $3)`, [
      id,
      title,
      status,
    ])
    await db.query(`insert into public.course_modules (id, course_id, title, position) values ($1, $2, 'Módulo 1', 0)`, [id + '-m1', id])
    await db.query(
      `insert into public.lessons (id, module_id, course_id, title, minutes, position, video_kind, video_url)
       values ($1, $2, $3, 'Aula um', 10, 0, 'link', 'https://video.example.com/' || $3)`,
      [id + '-a1', id + '-m1', id],
    )
    await db.query(`insert into public.lesson_materials (id, lesson_id, label, url, position) values ($1, $2, 'Apostila', 'https://material.example.com/x', 0)`, [
      id + '-mat',
      id + '-a1',
    ])
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    owner = await createUser(db, 'dona@folyo.test')
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    caio = await createUser(db, 'caio@folyo.test')
    await setRole(db, owner, 'proprietario')
    await addCourse('mkt', 'Marketing Estratégico na Prática')
    await addCourse('design', 'Design Gráfico: do Conceito ao Projeto')
    await addCourse('prog', 'Programação para Iniciantes')
    await addCourse('gratis', 'Descomplicando Processos Seletivos')
    await addCourse('rascunho', 'Curso ainda em rascunho', 'rascunho')
    // Preço e "liberar com cupom" passam pela função do painel (como o editor faz).
    for (const [id, price, promo] of [
      ['mkt', 3299, true],
      ['design', 4990, true],
      ['prog', 6990, false],
      ['rascunho', 1000, true],
    ] as const) {
      ok(await rpc(db, OWNER(), 'select public.admin_set_course_sale($1, $2, $3) as r', [id, price, promo]))
    }
  }, 120_000)

  describe('carrinho (quote_cart)', () => {
    test('sem cupom: subtotal e total em centavos', async () => {
      const q = ok(await quote(ana, ['mkt', 'design']))
      expect(q.subtotalCents).toBe(8289)
      expect(q.discountCents).toBe(0)
      expect(q.totalCents).toBe(8289)
      expect(q.coupon).toBeNull()
      expect(q.couponError).toBeNull()
      expect(q.items.map((i) => i.priceCents)).toEqual([3299, 4990])
    })

    test('FOLYO100 zera os cursos elegíveis', async () => {
      const q = ok(await quote(ana, ['mkt', 'design'], 'FOLYO100'))
      expect(q.coupon).toBe('FOLYO100')
      expect(q.percentOff).toBe(100)
      expect(q.accessDays).toBe(30)
      expect(q.discountCents).toBe(8289)
      expect(q.totalCents).toBe(0)
      expect(q.items.every((i) => i.eligible && i.finalCents === 0)).toBe(true)
    })

    test('minúsculas e espaços também valem', async () => {
      const q = ok(await quote(ana, ['mkt'], '  folyo100 '))
      expect(q.coupon).toBe('FOLYO100')
      expect(q.totalCents).toBe(0)
    })

    test('cupom inválido: mensagem e total inalterado', async () => {
      const q = ok(await quote(ana, ['mkt'], 'NAOEXISTE'))
      expect(q.couponError).toBe(INVALID)
      expect(q.coupon).toBeNull()
      expect(q.totalCents).toBe(3299)
      const weird = ok(await quote(ana, ['mkt'], 'FOLYO-100; drop table x'))
      expect(weird.couponError).toBe(INVALID)
    })

    test('código vazio', async () => {
      const q = ok(await quote(ana, ['mkt'], '   '))
      expect(q.couponError).toBe('Digite o código do cupom.')
    })

    test('curso que não participa mantém o preço', async () => {
      const q = ok(await quote(ana, ['mkt', 'prog'], 'FOLYO100'))
      expect(q.items.find((i) => i.courseId === 'prog')).toMatchObject({ eligible: false, discountCents: 0, finalCents: 6990 })
      expect(q.totalCents).toBe(6990)
      expect(q.totalCents).toBeGreaterThanOrEqual(0)
    })

    test('gratuitos, rascunhos, inexistentes e repetidos saem do cálculo', async () => {
      const q = ok(await quote(ana, ['mkt', 'gratis', 'rascunho', 'nao-existe', 'mkt']))
      expect(q.items.map((i) => i.courseId)).toEqual(['mkt'])
      expect(q.dropped).toEqual([
        { courseId: 'gratis', reason: 'gratuito' },
        { courseId: 'rascunho', reason: 'fora_de_venda' },
        { courseId: 'nao-existe', reason: 'fora_de_venda' },
      ])
      expect(q.subtotalCents).toBe(3299)
    })

    test('id com formato estranho é recusado', async () => {
      const r = await quote(ana, ["mkt' or 1=1"])
      expect(r).toMatchObject({ ok: false, code: 'FA400' })
    })

    test('visitante sem login não usa o carrinho', async () => {
      const r = await rpc(db, { uid: null }, `select public.quote_cart(array['mkt'], null) as r`)
      expect(r).toMatchObject({ ok: false, code: '42501' })
    })
  })

  describe('segurança das tabelas', () => {
    test('aluno não grava em course_access', async () => {
      const ins = await rpc(db, { uid: ana }, `insert into public.course_access (user_id, course_id, source) values ($1, 'mkt', 'manual') returning 1 as r`, [ana])
      expect(ins).toMatchObject({ ok: false, code: '42501' })
      const upd = await rpc(db, { uid: ana }, `update public.course_access set expires_at = null returning 1 as r`)
      expect(upd).toMatchObject({ ok: false, code: '42501' })
      const del = await rpc(db, { uid: ana }, `delete from public.course_access returning 1 as r`)
      expect(del).toMatchObject({ ok: false, code: '42501' })
    })

    test('aluno não lê os cupons', async () => {
      const r = await rpc(db, { uid: ana }, `select count(*) as r from private.coupons`)
      expect(r).toMatchObject({ ok: false, code: '42501' })
    })

    test('aluno não lê o vídeo direto da tabela de aulas', async () => {
      const r = await rpc(db, { uid: ana }, `select video_url as r from public.lessons limit 1`)
      expect(r).toMatchObject({ ok: false, code: '42501' })
      // Título e duração continuam abertos (a página do curso mostra o conteúdo).
      const t = await rpc<number>(db, { uid: ana }, `select count(*)::int as r from public.lessons where course_id = 'mkt'`)
      expect(t).toEqual({ ok: true, data: 1 })
    })

    test('curso pago sem acesso: sem vídeo, sem material e sem "aula concluída"', async () => {
      expect(await hasAccess(ana, 'mkt')).toBe(false)
      expect(await hasAccess(ana, 'gratis')).toBe(true)
      const videos = ok(await rpc<{ id: string }[]>(db, { uid: ana }, 'select public.lesson_videos() as r'))
      expect(videos.map((v) => v.id).sort()).toEqual(['gratis-a1'])
      const mats = ok(await rpc<string[]>(db, { uid: ana }, `select coalesce(array_agg(id order by id), '{}') as r from public.lesson_materials`))
      expect(mats).toEqual(['gratis-mat'])
      const done = await rpc(db, { uid: ana }, `insert into public.lesson_completions (course_id, lesson_id) values ('mkt', 'mkt-a1') returning 1 as r`)
      expect(done).toMatchObject({ ok: false, code: '42501' })
      const free = await rpc(db, { uid: ana }, `insert into public.lesson_completions (course_id, lesson_id) values ('gratis', 'gratis-a1') returning 1 as r`)
      expect(free.ok).toBe(true)
      const ev = await rpc(db, { uid: ana }, `select public.player_event(gen_random_uuid(), 'mkt', 'mkt-a1', 'play') as r`)
      expect(ev).toMatchObject({ ok: false, code: 'FA404' })
    })

    test('o navegador não consegue mandar preço: a função só aceita ids e código', async () => {
      const r = await rpc(db, { uid: ana }, `select public.quote_cart(array['mkt'], 'FOLYO100', 0) as r`)
      expect(r.ok).toBe(false)
    })
  })

  describe('pré-acesso (redeem_launch_coupon)', () => {
    test('libera 30 dias só nos elegíveis, sem pagamento', async () => {
      const r = ok(await redeem(ana, ['mkt', 'prog', 'gratis'], 'folyo100'))
      expect(r.courses.map((c) => c.id)).toEqual(['mkt'])
      expect(r.leftoverIds).toEqual(['prog'])
      expect(r.droppedIds).toEqual(['gratis'])
      const days = ok(
        await rpc<number>(db, { uid: ana }, `select round(extract(epoch from (expires_at - granted_at)) / 86400)::int as r from public.course_access where course_id = 'mkt'`),
      )
      expect(days).toBe(30)
      expect(await hasAccess(ana, 'mkt')).toBe(true)
      expect(await hasAccess(ana, 'prog')).toBe(false)
      const videos = ok(await rpc<{ id: string }[]>(db, { uid: ana }, 'select public.lesson_videos() as r'))
      expect(videos.map((v) => v.id).sort()).toEqual(['gratis-a1', 'mkt-a1'])
      const done = await rpc(db, { uid: ana }, `insert into public.lesson_completions (course_id, lesson_id) values ('mkt', 'mkt-a1') returning 1 as r`)
      expect(done.ok).toBe(true)
    })

    test('grava a auditoria', async () => {
      const n = await db.query<{ n: number }>(`select count(*)::int as n from private.admin_audit where action = 'cupom.resgatado' and target_id = $1`, [ana])
      expect(n.rows[0].n).toBe(1)
    })

    test('o aluno vê as próprias liberações e só as dele', async () => {
      const mine = ok(await rpc<{ items: { courseId: string; active: boolean }[] }>(db, { uid: ana }, 'select public.my_course_access() as r'))
      expect(mine.items).toEqual([expect.objectContaining({ courseId: 'mkt', source: 'cupom', active: true })])
      const other = ok(await rpc<{ items: unknown[] }>(db, { uid: bia }, 'select public.my_course_access() as r'))
      expect(other.items).toEqual([])
      const rows = ok(await rpc<number>(db, { uid: bia }, 'select count(*)::int as r from public.course_access'))
      expect(rows).toBe(0)
    })

    test('reaplicar o cupom não renova o mês', async () => {
      const before = (await db.query<{ e: string }>(`select expires_at::text as e from public.course_access where user_id = $1 and course_id = 'mkt'`, [ana])).rows[0].e
      const again = await redeem(ana, ['mkt'], 'FOLYO100')
      expect(again).toMatchObject({ ok: false, code: 'FC422' })
      const q = ok(await quote(ana, ['mkt'], 'FOLYO100'))
      expect(q.dropped).toEqual([{ courseId: 'mkt', reason: 'ja_possui' }])
      const after = (await db.query<{ e: string }>(`select expires_at::text as e from public.course_access where user_id = $1 and course_id = 'mkt'`, [ana])).rows[0].e
      expect(after).toBe(before)
    })

    test('pré-acesso vencido bloqueia e não volta com o cupom', async () => {
      await db.query(`update public.course_access set expires_at = now() - interval '1 minute' where user_id = $1 and course_id = 'mkt'`, [ana])
      expect(await hasAccess(ana, 'mkt')).toBe(false)
      const q = ok(await quote(ana, ['mkt'], 'FOLYO100'))
      expect(q.items[0]).toMatchObject({ courseId: 'mkt', eligible: false, finalCents: 3299 })
      expect(await redeem(ana, ['mkt'], 'FOLYO100')).toMatchObject({ ok: false, code: 'FC422' })
      const mats = ok(await rpc<string[]>(db, { uid: ana }, `select coalesce(array_agg(id order by id), '{}') as r from public.lesson_materials`))
      expect(mats).toEqual(['gratis-mat'])
    })

    test('sem cupom não libera nada', async () => {
      expect(await redeem(bia, ['design'], null)).toMatchObject({ ok: false, code: 'FC422' })
      expect(await redeem(bia, ['design'], 'ERRADO')).toMatchObject({ ok: false, code: 'FC422', message: INVALID })
      expect(await hasAccess(bia, 'design')).toBe(false)
    })
  })

  describe('painel', () => {
    test('aluno e equipe sem o 2º fator não mexem na promoção', async () => {
      expect(await rpc(db, { uid: ana }, 'select public.admin_set_launch_promo(false) as r')).toMatchObject({ ok: false, code: 'FA403' })
      expect(await rpc(db, { uid: owner, aal: 'aal1' }, 'select public.admin_set_launch_promo(false) as r')).toMatchObject({ ok: false, code: 'FA403' })
      expect(await rpc(db, { uid: ana }, `select public.admin_set_course_sale('mkt', 1, true) as r`)).toMatchObject({ ok: false, code: 'FA403' })
      expect(await rpc(db, { uid: ana }, `select public.admin_grant_course_access($1, 'prog') as r`, [ana])).toMatchObject({ ok: false, code: 'FA403' })
    })

    test('desligar a promoção encerra o cupom e os pré-acessos dele', async () => {
      ok(await redeem(bia, ['design'], 'FOLYO100'))
      expect(await hasAccess(bia, 'design')).toBe(true)
      ok(await rpc(db, OWNER(), 'select public.admin_set_launch_promo(false) as r'))
      expect(await hasAccess(bia, 'design')).toBe(false)
      const q = ok(await quote(caio, ['mkt'], 'FOLYO100'))
      expect(q.couponError).toBe(ENDED)
      expect(q.totalCents).toBe(3299)
      expect(await redeem(caio, ['mkt'], 'FOLYO100')).toMatchObject({ ok: false, message: ENDED })
      const state = ok(await rpc<{ active: boolean }>(db, { uid: caio }, 'select public.launch_promo_state() as r'))
      expect(state.active).toBe(false)
      ok(await rpc(db, OWNER(), 'select public.admin_set_launch_promo(true) as r'))
      expect(await hasAccess(bia, 'design')).toBe(true)
    })

    test('promoção fora do prazo ou no limite de usos também encerra', async () => {
      await db.query(`update private.coupons set ends_at = now() - interval '1 day', starts_at = now() - interval '2 days' where code = 'FOLYO100'`)
      expect(ok(await quote(caio, ['mkt'], 'FOLYO100')).couponError).toBe(ENDED)
      await db.query(`update private.coupons set ends_at = null, starts_at = null, max_redemptions = 2 where code = 'FOLYO100'`)
      // Ana e Bia já usaram: Caio fica de fora; Bia (que já usou) ainda pode usar em outro curso.
      expect(ok(await quote(caio, ['mkt'], 'FOLYO100')).couponError).toBe(ENDED)
      expect(ok(await quote(bia, ['mkt'], 'FOLYO100')).couponError).toBeNull()
      await db.query(`update private.coupons set max_redemptions = null where code = 'FOLYO100'`)
      expect(ok(await quote(caio, ['mkt'], 'FOLYO100')).couponError).toBeNull()
    })

    test('liberação manual e remoção, com auditoria', async () => {
      expect(await hasAccess(caio, 'prog')).toBe(false)
      ok(await rpc(db, OWNER(), `select public.admin_grant_course_access($1, 'prog') as r`, [caio]))
      expect(await hasAccess(caio, 'prog')).toBe(true)
      const q = ok(await quote(caio, ['prog']))
      expect(q.dropped).toEqual([{ courseId: 'prog', reason: 'ja_possui' }])
      const list = ok(await rpc<{ courseId: string; source: string }[]>(db, OWNER(), 'select public.admin_user_course_access($1) as r', [caio]))
      expect(list).toEqual([expect.objectContaining({ courseId: 'prog', source: 'manual', active: true })])
      expect(await rpc(db, OWNER(), `select public.admin_grant_course_access($1, 'gratis') as r`, [caio])).toMatchObject({ ok: false, code: 'FA400' })
      ok(await rpc(db, OWNER(), `select public.admin_revoke_course_access($1, 'prog') as r`, [caio]))
      expect(await hasAccess(caio, 'prog')).toBe(false)
      const audit = await db.query<{ action: string }>(`select action from private.admin_audit where target_id = $1 order by id`, [caio])
      expect(audit.rows.map((r) => r.action)).toEqual(['acesso.liberado', 'acesso.removido'])
    })

    test('equipe (com 2º fator) assiste a qualquer curso', async () => {
      expect(await rpc(db, OWNER(), `select public.has_course_access('prog') as r`)).toEqual({ ok: true, data: true })
    })

    test('curso sem preço volta a ser gratuito para todos', async () => {
      ok(await rpc(db, OWNER(), `select public.admin_set_course_sale('prog', null, false) as r`))
      expect(await hasAccess(caio, 'prog')).toBe(true)
      ok(await rpc(db, OWNER(), `select public.admin_set_course_sale('prog', 6990, false) as r`))
      expect(await hasAccess(caio, 'prog')).toBe(false)
    })
  })

  test('LGPD: "baixar meus dados" inclui as liberações', async () => {
    const data = ok(await rpc<{ acessos_a_cursos: { curso: string; origem: string }[] }>(db, { uid: bia }, 'select public.export_my_data() as r'))
    expect(data.acessos_a_cursos).toEqual([expect.objectContaining({ curso: 'design', origem: 'cupom' })])
  })

  test('a migration pode ser rodada de novo sem erro', async () => {
    const mine = migrations!.find((m) => m.name.includes('cupom_lancamento'))!
    await db.exec(mine.sql)
    expect(await hasAccess(bia, 'design')).toBe(true)
  })

})
