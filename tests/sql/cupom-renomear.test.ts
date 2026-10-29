import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * Troca do código do cupom (FOLYO100 → LANCAMENTO): monta o banco COM o código antigo, resgata um
 * pré-acesso, roda a migration da troca e confere que nada se perdeu e que só o código novo vale.
 */

const all = loadMigrations()
const RENAME = '20261030000003_cupom_lancamento_renomear.sql'
const before = all?.filter((m) => m.name < RENAME) ?? []
const rename = all?.find((m) => m.name === RENAME)

type Quote = { totalCents: number; coupon: string | null; couponError: string | null }
type State = { code: string; active: boolean; percentOff: number; accessDays: number }

describe.skipIf(!all || !rename)('troca do código do cupom (SQL)', () => {
  let db: Db
  let owner: string
  let ana: string
  let bia: string
  const OWNER = () => ({ uid: owner, aal: 'aal2' as const })

  const ok = <T>(r: { ok: true; data: T } | { ok: false; message: string }): T => {
    if (!r.ok) throw new Error(r.message)
    return r.data
  }
  const quote = (uid: string, code: string | null) => rpc<Quote>(db, { uid }, 'select public.quote_cart($1::text[], $2) as r', [['mkt'], code])
  const hasAccess = async (uid: string) => ok(await rpc<boolean>(db, { uid }, `select public.has_course_access('mkt') as r`))

  beforeAll(async () => {
    db = await createDb(before)
    owner = await createUser(db, 'dona@folyo.test')
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    await setRole(db, owner, 'proprietario')
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ('mkt', 'Marketing Estratégico', 'marketing', 'Resumo do curso para o teste.', 'publicado')`)
    await db.query(`insert into public.course_modules (id, course_id, title, position) values ('mkt-m1', 'mkt', 'Módulo 1', 0)`)
    ok(await rpc(db, OWNER(), `select public.admin_set_course_sale('mkt', 3299, true) as r`))
    // Regras personalizadas no cupom antigo: têm que ir junto para o novo.
    await db.query(`update private.coupons set access_days = 45, max_redemptions = 7 where code = 'FOLYO100'`)
    // A Ana resgata o pré-acesso com o código antigo, antes da troca.
    ok(await rpc(db, { uid: ana }, `select public.redeem_launch_coupon(array['mkt'], 'FOLYO100') as r`))
  }, 120_000)

  test('antes da troca: o código antigo vale e a Ana tem acesso', async () => {
    expect(ok(await quote(bia, 'FOLYO100')).couponError).toBeNull()
    expect(await hasAccess(ana)).toBe(true)
  })

  test('depois da troca: o pré-acesso da Ana continua valendo, agora ligado ao código novo', async () => {
    await db.exec(rename!.sql)
    expect(await hasAccess(ana)).toBe(true)
    const { rows } = await db.query<{ coupon_code: string }>(`select coupon_code from public.course_access where user_id = $1`, [ana])
    expect(rows).toEqual([{ coupon_code: 'LANCAMENTO' }])
  })

  test('o cupom novo herda as regras do antigo e o antigo some', async () => {
    const { rows } = await db.query<{ code: string; access_days: number; max_redemptions: number; percent_off: number }>(
      `select code, access_days, max_redemptions, percent_off from private.coupons order by code`,
    )
    expect(rows).toEqual([{ code: 'LANCAMENTO', access_days: 45, max_redemptions: 7, percent_off: 100 }])
  })

  test('LANCAMENTO zera o curso (maiúsculas, minúsculas e espaços valem) e FOLYO100 não existe mais', async () => {
    const novo = ok(await quote(bia, '  lancamento '))
    expect(novo.coupon).toBe('LANCAMENTO')
    expect(novo.couponError).toBeNull()
    expect(novo.totalCents).toBe(0)
    const antigo = ok(await quote(bia, 'FOLYO100'))
    expect(antigo.coupon).toBeNull()
    expect(antigo.couponError).toBe('Este cupom não existe ou não é válido.')
  })

  test('a Bia consegue resgatar com o código novo e o antigo é recusado', async () => {
    const old = await rpc(db, { uid: bia }, `select public.redeem_launch_coupon(array['mkt'], 'FOLYO100') as r`)
    expect(old.ok).toBe(false)
    ok(await rpc(db, { uid: bia }, `select public.redeem_launch_coupon(array['mkt'], 'LANCAMENTO') as r`))
    expect(await hasAccess(bia)).toBe(true)
  })

  test('a tela do aluno lê o estado do cupom novo', async () => {
    const state = ok(await rpc<State>(db, { uid: ana }, 'select public.launch_promo_state() as r'))
    expect(state).toMatchObject({ code: 'LANCAMENTO', active: true, percentOff: 100, accessDays: 45 })
  })

  test('o painel desliga e liga a promoção pelo código novo (desligar encerra os pré-acessos)', async () => {
    ok(await rpc(db, OWNER(), 'select public.admin_set_launch_promo(false) as r'))
    expect(await hasAccess(ana)).toBe(false)
    expect(ok(await rpc<State>(db, { uid: ana }, 'select public.launch_promo_state() as r')).active).toBe(false)
    ok(await rpc(db, OWNER(), 'select public.admin_set_launch_promo(true) as r'))
    expect(await hasAccess(ana)).toBe(true)
  })

  test('rodar a troca de novo não muda nada', async () => {
    await db.exec(rename!.sql)
    const { rows } = await db.query<{ code: string }>(`select code from private.coupons`)
    expect(rows).toEqual([{ code: 'LANCAMENTO' }])
    expect(await hasAccess(ana)).toBe(true)
  })
})
