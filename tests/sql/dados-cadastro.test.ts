import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, rpc, type Db } from './db'

/**
 * Dados do cadastro completo (migration 20261104000002): celular, data de nascimento e gênero.
 *
 * Ficam em private.personal_data, fora da API. Aqui conferimos que só a própria pessoa lê e grava (pelas funções),
 * que o banco recusa dado fora do formato mesmo chamando a função direto, e que nada vaza pela API.
 */

const migrations = loadMigrations()

type Personal = { phone: string; birthDate: string; gender: string; whatsappNews: boolean } | null

describe.skipIf(!migrations)('dados do cadastro completo', () => {
  let db: Db
  let ana: string
  let bia: string
  let caio: string

  const save = (uid: string | null, phone: string, birth: string, gender: string, news: boolean | null = null) =>
    rpc(db, { uid }, 'select public.save_my_personal_data($1, $2::date, $3, $4) as r', [phone, birth, gender, news])
  const mine = async (uid: string) => {
    const r = await rpc<Personal>(db, { uid }, 'select public.my_personal_data() as r')
    if (!r.ok) throw new Error(r.message)
    return r.data
  }
  const consentAt = async (uid: string) =>
    (await db.query<{ at: string | null }>('select whatsapp_news_at::text as at from private.personal_data where user_id = $1', [uid])).rows[0]?.at ?? null

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    caio = await createUser(db, 'caio@folyo.test')
  }, 120_000)

  test('quem não concluiu recebe nada (o aviso do sino depende disso)', async () => {
    expect(await mine(ana)).toBeNull()
  })

  test('grava e lê os próprios dados', async () => {
    expect((await save(ana, '+5535998765432', '2001-08-25', 'feminino')).ok).toBe(true)
    expect(await mine(ana)).toEqual({ phone: '+5535998765432', birthDate: '2001-08-25', gender: 'feminino', whatsappNews: false })
    // Bia não vê nada da Ana.
    expect(await mine(bia)).toBeNull()
  })

  test('atualizar troca os dados e mantém o aceite do WhatsApp quando ele não vem', async () => {
    expect((await save(caio, '+5511988887777', '1990-01-10', 'masculino', true)).ok).toBe(true)
    const firstAt = await consentAt(caio)
    expect(firstAt).not.toBeNull()
    expect((await save(caio, '+5511988887777', '1990-01-10', 'nao_informar')).ok).toBe(true)
    expect(await mine(caio)).toMatchObject({ gender: 'nao_informar', whatsappNews: true })
    // A data do aceite só muda quando o aceite muda.
    expect(await consentAt(caio)).toBe(firstAt)
  })

  test('liga e desliga o WhatsApp; ligar sem cadastro é recusado', async () => {
    expect((await rpc(db, { uid: ana }, 'select public.set_my_whatsapp_news(true) as r')).ok).toBe(true)
    expect((await mine(ana))?.whatsappNews).toBe(true)
    expect(await consentAt(ana)).not.toBeNull()
    expect((await rpc(db, { uid: ana }, 'select public.set_my_whatsapp_news(false) as r')).ok).toBe(true)
    expect((await mine(ana))?.whatsappNews).toBe(false)

    expect(await rpc(db, { uid: bia }, 'select public.set_my_whatsapp_news(true) as r')).toMatchObject({ ok: false, code: 'FA409' })
    // Desligar sem cadastro não tem o que desligar.
    expect((await rpc(db, { uid: bia }, 'select public.set_my_whatsapp_news(false) as r')).ok).toBe(true)
  })

  test('formato errado é recusado mesmo chamando a função direto', async () => {
    for (const phone of ['', '35998765432', '+1555123456', '+5535898765432', '+55359987654321', "+5535998765432' or 1=1"]) {
      expect(await save(bia, phone, '2001-08-25', 'feminino')).toMatchObject({ ok: false, code: 'FA400' })
    }
    for (const gender of ['', 'Feminino', 'x', 'nao binario']) {
      expect(await save(bia, '+5535998765432', '2001-08-25', gender)).toMatchObject({ ok: false, code: 'FA400' })
    }
    expect(await mine(bia)).toBeNull()
  })

  test('data de nascimento: no futuro, muito nova ou muito antiga é recusada', async () => {
    const today = (await db.query<{ d: string }>(`select ((now() at time zone 'America/Sao_Paulo')::date)::text as d`)).rows[0].d
    const shift = async (years: number, days = 0) =>
      (
        await db.query<{ d: string }>(`select (($1::date + make_interval(years => $2::int))::date + $3::int)::text as d`, [today, years, days])
      ).rows[0].d

    expect(await save(bia, '+5535998765432', await shift(1), 'feminino')).toMatchObject({ ok: false, code: 'FA400' })
    // 10 anos amanhã: ainda tem 9.
    expect(await save(bia, '+5535998765432', await shift(-10, 1), 'feminino')).toMatchObject({ ok: false, code: 'FA400' })
    // 121 anos: passou do limite.
    expect(await save(bia, '+5535998765432', await shift(-121), 'feminino')).toMatchObject({ ok: false, code: 'FA400' })
    expect(await save(bia, '+5535998765432', '1899-12-31', 'feminino')).toMatchObject({ ok: false, code: 'FA400' })
    // Fez 10 anos hoje: pode.
    expect((await save(bia, '+5535998765432', await shift(-10), 'outro')).ok).toBe(true)
  })

  test('sem login nada funciona', async () => {
    expect(await rpc(db, { uid: null }, 'select public.my_personal_data() as r')).toMatchObject({ ok: false })
    expect(await save(null, '+5535998765432', '2001-08-25', 'feminino')).toMatchObject({ ok: false })
    expect(await rpc(db, { uid: null }, 'select public.set_my_whatsapp_news(true) as r')).toMatchObject({ ok: false })
  })

  test('conta suspensa não grava', async () => {
    const zed = await createUser(db, 'zed@folyo.test')
    await db.query(`insert into private.suspensions (user_id, reason) values ($1, 'teste')`, [zed])
    expect(await save(zed, '+5535998765432', '2001-08-25', 'feminino')).toMatchObject({ ok: false, code: 'FA403' })
  })

  test('a tabela não é alcançável pela API nem pelo token do aluno', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = await db.query<{ ok: boolean }>(`select has_table_privilege($1, 'private.personal_data', 'select') as ok`, [role])
      expect(r.rows[0].ok).toBe(false)
    }
    await expect(as(db, { uid: ana }, (tx) => tx.query('select * from private.personal_data'))).rejects.toThrow()
    await expect(
      as(db, { uid: ana }, (tx) => tx.query(`update private.personal_data set gender = 'outro' where user_id = $1`, [ana])),
    ).rejects.toThrow()
    // Visitante não chama as funções.
    for (const fn of ['public.my_personal_data()', 'public.save_my_personal_data(text, date, text, boolean)', 'public.set_my_whatsapp_news(boolean)']) {
      const r = await db.query<{ ok: boolean }>(`select has_function_privilege('anon', $1, 'execute') as ok`, [fn])
      expect(r.rows[0].ok).toBe(false)
    }
  })

  test('entra no "Baixar meus dados" e some junto com a conta', async () => {
    const r = await rpc<{ dados_do_cadastro: { celular: string; genero: string } | null }>(
      db,
      { uid: ana },
      'select public.export_my_data() as r',
    )
    expect(r.ok && r.data.dados_do_cadastro).toMatchObject({ celular: '+5535998765432', genero: 'feminino' })

    await db.query('delete from auth.users where id = $1', [ana])
    const left = await db.query('select 1 from private.personal_data where user_id = $1', [ana])
    expect(left.rows).toHaveLength(0)
  })

  test('o cadastro (signUp) continua sem celular: o perfil nasce igual', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name in ('account_phone', 'birth_date', 'gender')`,
    )
    expect(r.rows[0].n).toBe(0)
  })
})
