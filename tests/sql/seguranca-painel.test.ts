import { beforeAll, describe, expect, test } from 'vitest'
import { createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * Segurança do painel (migration 20261104000005): histórico só de inclusão, sempre um proprietário ativo, registro
 * das mudanças feitas fora do painel e nomes sem caracteres invisíveis.
 *
 * Produção estava sem a etapa 4b (20261022000003). Os testes rodam com o banco deixado nesse estado (sem os gatilhos,
 * sem a regra do nome e com a chave estrangeira do autor no histórico) e só então aplicam a migration nova.
 */

const migrations = loadMigrations()
const fix = migrations?.find((m) => m.name === '20261104000005_seguranca_do_painel.sql')

describe.skipIf(!migrations)('segurança do painel', () => {
  let db: Db
  let dono: string
  let admin: string
  let ana: string

  const owner = { aal: 'aal2' as const }
  const audit = async () =>
    (
      await db.query<{ action: string; actor_label: string; target_id: string | null; detail: string }>(
        'select action, actor_label, target_id, detail from private.admin_audit order by at, id',
      )
    ).rows
  const lastAudit = async () => (await audit()).at(-1)

  beforeAll(async () => {
    db = await createDb(migrations!.filter((m) => m !== fix))
    // Estado da produção em 04/11/2026: a etapa 4b nunca rodou.
    await db.exec(`
      drop trigger if exists admin_audit_append_only on private.admin_audit;
      drop trigger if exists admin_audit_no_truncate on private.admin_audit;
      drop trigger if exists guard_last_owner on private.staff_roles;
      drop trigger if exists guard_last_owner on private.suspensions;
      drop trigger if exists audit_outside_panel on private.staff_roles;
      drop trigger if exists audit_outside_panel on private.suspensions;
      drop trigger if exists write_rate on private.staff_roles;
      drop trigger if exists write_rate on private.suspensions;
      alter table public.profiles drop constraint if exists profiles_name_plain;
      alter table private.admin_audit add constraint admin_audit_actor_id_fkey
        foreign key (actor_id) references auth.users (id) on delete set null;
    `)
    // Sem a migration: o histórico podia ser apagado.
    await db.query(`insert into private.admin_audit (actor_label, actor_role, action, target_label, detail) values ('x', 'sistema', 'permissao.alterada', '', 'teste')`)
    await db.query(`delete from private.admin_audit where detail = 'teste'`)

    await db.exec(fix!.sql)
    await db.exec(fix!.sql) // pode rodar de novo

    dono = await createUser(db, 'dono@folyo.test')
    admin = await createUser(db, 'admin@folyo.test')
    ana = await createUser(db, 'ana@folyo.test')
    await setRole(db, dono, 'proprietario') // pelo "SQL Editor": vai para o histórico como fora do painel
  }, 120_000)

  test('mudança feita fora do painel entra no histórico', async () => {
    expect(await lastAudit()).toMatchObject({ action: 'permissao.alterada', target_id: dono, detail: 'aluno → proprietario (fora do painel)' })
    expect((await lastAudit())?.actor_label).toMatch(/^Fora do painel/)
  })

  test('mudança pelo painel entra uma vez só, do jeito do painel', async () => {
    const before = (await audit()).length
    const r = await rpc(db, { uid: dono, ...owner }, `select public.admin_set_role($1, 'admin') as r`, [admin])
    expect(r.ok).toBe(true)
    const rows = await audit()
    expect(rows).toHaveLength(before + 1)
    expect(rows.at(-1)).toMatchObject({ action: 'permissao.alterada', target_id: admin, detail: 'aluno → admin' })
    expect(rows.at(-1)?.actor_label).toContain('dono@folyo.test')
  })

  test('o histórico não pode ser alterado, apagado nem esvaziado', async () => {
    await expect(db.query(`update private.admin_audit set detail = 'apagado'`)).rejects.toThrow(/não pode ser alterado/)
    await expect(db.query('delete from private.admin_audit')).rejects.toThrow(/não pode ser alterado/)
    await expect(db.query('truncate private.admin_audit')).rejects.toThrow(/não pode ser alterado/)
    expect((await audit()).length).toBeGreaterThan(0)
  })

  test('o último proprietário ativo não é rebaixado, removido nem suspenso, por nenhum caminho', async () => {
    await expect(db.query(`update private.staff_roles set role = 'admin' where user_id = $1`, [dono])).rejects.toThrow(/proprietário ativo/)
    await expect(db.query('delete from private.staff_roles where user_id = $1', [dono])).rejects.toThrow(/proprietário ativo/)
    await expect(db.query(`insert into private.suspensions (user_id, reason) values ($1, 'x')`, [dono])).rejects.toThrow(/proprietário ativo/)
    // Pelo painel: outro proprietário (com a verificação em duas etapas) tentando rebaixar o único dono ativo.
    const outro = await createUser(db, 'outro@folyo.test')
    await setRole(db, outro, 'proprietario')
    await db.query(`insert into private.suspensions (user_id, reason) values ($1, 'teste')`, [outro])
    expect(await rpc(db, { uid: outro, ...owner }, `select public.admin_set_role($1, 'admin') as r`, [dono])).toMatchObject({ ok: false })
    // Com outro proprietário ativo, pode.
    await db.query('delete from private.suspensions where user_id = $1', [outro])
    expect((await rpc(db, { uid: outro, ...owner }, `select public.admin_set_role($1, 'admin') as r`, [dono])).ok).toBe(true)
    expect((await rpc(db, { uid: outro, ...owner }, `select public.admin_set_role($1, 'proprietario') as r`, [dono])).ok).toBe(true)
  })

  test('excluir a conta mantém quem fez no histórico e registra a saída', async () => {
    // O admin age no painel e depois exclui a própria conta.
    await setRole(db, admin, 'admin')
    expect((await rpc(db, { uid: admin, ...owner }, `select public.admin_set_suspended($1, true, 'spam') as r`, [ana])).ok).toBe(true)
    expect((await rpc(db, { uid: admin }, 'select public.delete_my_account() as r')).ok).toBe(true)

    const rows = await audit()
    const suspended = rows.find((r) => r.action === 'usuario.suspenso' && r.detail === 'spam')
    expect(suspended?.actor_label).toContain('admin@folyo.test')
    const left = rows.at(-1)
    expect(left).toMatchObject({ action: 'permissao.alterada', target_id: null, actor_label: 'A própria pessoa' })
    expect(left?.detail).toBe('admin → aluno (conta excluída)')
    // Registros antigos sobre a conta excluída ficam, só sem o id dela.
    expect(rows.filter((r) => r.target_id === admin)).toHaveLength(0)
  })

  test('nomes: o cadastro limpa e o banco recusa caracteres invisíveis e "·"', async () => {
    const r = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('zw@folyo.test', $1) returning id`,
      [JSON.stringify({ name: 'Ana​ Souza · Admin‮' })],
    )
    const name = (await db.query<{ name: string }>('select name from public.profiles where id = $1', [r.rows[0].id])).rows[0].name
    expect(name).toBe('Ana Souza  Admin')
    for (const bad of ['Ana​Souza', 'Ana · Souza', 'Ana­Souza', 'Ana﻿', 'Ana\u0007']) {
      await expect(db.query('update public.profiles set name = $1 where id = $2', [bad, ana])).rejects.toThrow()
    }
    await db.query(`update public.profiles set name = 'Ana Souza-Silva' where id = $1`, [ana])
  })

  test('as funções internas não são chamáveis pela API', async () => {
    for (const fn of ['private.guard_last_owner()', 'private.audit_append_only()', 'private.audit_outside_panel()']) {
      for (const role of ['anon', 'authenticated']) {
        const r = await db.query<{ ok: boolean }>(`select has_function_privilege($1, $2, 'execute') as ok`, [role, fn])
        expect(r.rows[0].ok).toBe(false)
      }
    }
  })
})
