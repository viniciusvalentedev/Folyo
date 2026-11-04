import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * "Excluir minha conta" (migration 20261104000003): delete_my_account apaga a conta de quem chama e, em cascata,
 * os dados dela, mesmo com o limite de gravações ligado; nunca deixa a Folyo sem um proprietário ativo.
 */

const migrations = loadMigrations()

describe.skipIf(!migrations)('excluir minha conta', () => {
  let db: Db

  const exists = async (table: string, column: string, id: string) =>
    (await db.query(`select 1 from ${table} where ${column} = $1`, [id])).rows.length > 0
  const remove = (uid: string | null) => rpc(db, { uid }, 'select public.delete_my_account() as r')

  beforeAll(async () => {
    db = await createDb(migrations!)
  }, 120_000)

  test('apaga a conta e os dados dela (perfil, cadastro, contador de gravações)', async () => {
    const ana = await createUser(db, 'ana@folyo.test')
    // Gravações normais passam pelo limite (cria a linha do contador).
    await as(db, { uid: ana }, (tx) => tx.query(`update public.profiles set city = 'Poços de Caldas' where id = $1`, [ana]))
    expect((await rpc(db, { uid: ana }, `select public.save_my_personal_data('+5535998765432', '2001-08-25', 'feminino') as r`)).ok).toBe(true)
    expect(await exists('private.write_rate', 'user_id', ana)).toBe(true)

    expect((await remove(ana)).ok).toBe(true)
    for (const [table, column] of [
      ['auth.users', 'id'],
      ['public.profiles', 'id'],
      ['private.personal_data', 'user_id'],
      ['private.write_rate', 'user_id'],
    ]) {
      expect(await exists(table, column, ana)).toBe(false)
    }
  })

  test('só apaga a própria conta, e sem login não faz nada', async () => {
    const bia = await createUser(db, 'bia@folyo.test')
    const caio = await createUser(db, 'caio@folyo.test')
    expect((await remove(caio)).ok).toBe(true)
    expect(await exists('auth.users', 'id', bia)).toBe(true)
    expect(await remove(null)).toMatchObject({ ok: false })
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('anon', 'public.delete_my_account()', 'execute') as ok`)
    expect(r.rows[0].ok).toBe(false)
  })

  test('o último proprietário ativo não sai; com outro proprietário ativo, sai', async () => {
    const dono = await createUser(db, 'dono@folyo.test')
    const dona = await createUser(db, 'dona@folyo.test')
    await setRole(db, dono, 'proprietario')
    await setRole(db, dona, 'proprietario')
    // A outra proprietária está suspensa: não conta como ativa.
    await db.query(`insert into private.suspensions (user_id, reason) values ($1, 'teste')`, [dona])
    expect(await remove(dono)).toMatchObject({ ok: false, code: 'FA409' })
    expect(await exists('auth.users', 'id', dono)).toBe(true)

    await db.query('delete from private.suspensions where user_id = $1', [dona])
    expect((await remove(dono)).ok).toBe(true)
    expect(await exists('auth.users', 'id', dono)).toBe(false)
    // Agora ela é a única.
    expect(await remove(dona)).toMatchObject({ ok: false, code: 'FA409' })
  })
})

/**
 * Produção estava sem a migration LGPD (20261027000001) e sem a etapa 4b (20261022000003): sem delete_my_account,
 * com o limite de gravações antigo e sem o gatilho do último proprietário. Aqui o banco é deixado nesse estado e a
 * migration nova, sozinha, precisa resolver.
 */
describe.skipIf(!migrations)('excluir minha conta: banco no estado em que a produção estava', () => {
  let db: Db
  const fix = migrations?.find((m) => m.name === '20261104000003_excluir_conta.sql')

  beforeAll(async () => {
    db = await createDb(migrations!.filter((m) => m !== fix))
    await db.exec(`
      drop function public.delete_my_account();
      drop trigger if exists guard_last_owner on private.staff_roles;
      drop trigger if exists guard_last_owner on private.suspensions;
      create or replace function private.enforce_write_rate() returns trigger language plpgsql security definer
      set search_path = '' as $$
      declare uid uuid := auth.uid(); m timestamptz := date_trunc('minute', now()); h timestamptz := date_trunc('hour', now());
      begin
        if uid is null then return null; end if;
        insert into private.write_rate as w (user_id, minute_start, minute_count, hour_start, hour_count)
        values (uid, m, 1, h, 1) on conflict (user_id) do update set minute_count = w.minute_count + 1;
        return null;
      end; $$;
    `)
  }, 120_000)

  test('antes: a função não existe; depois da migration: apaga e protege o último proprietário', async () => {
    const ana = await createUser(db, 'ana@folyo.test')
    await as(db, { uid: ana }, (tx) => tx.query(`update public.profiles set city = 'Poços' where id = $1`, [ana]))
    expect(await rpc(db, { uid: ana }, 'select public.delete_my_account() as r')).toMatchObject({ ok: false })

    await db.exec(fix!.sql)
    await db.exec(fix!.sql) // pode rodar de novo
    expect((await rpc(db, { uid: ana }, 'select public.delete_my_account() as r')).ok).toBe(true)
    expect((await db.query('select 1 from auth.users where id = $1', [ana])).rows).toHaveLength(0)

    const dono = await createUser(db, 'dono@folyo.test')
    await setRole(db, dono, 'proprietario')
    expect(await rpc(db, { uid: dono }, 'select public.delete_my_account() as r')).toMatchObject({ ok: false, code: 'FA409' })
  })
})
