import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * Trilhas no painel, rodando as migrations DE VERDADE (Postgres em memória): as 7 trilhas de sempre
 * vêm prontas, o aluno só lê, a equipe cria/edita/ordena/exclui e o banco recusa o que não presta.
 */

const migrations = loadMigrations()

type Row = { id: string; title: string; icon: string; skills: string[]; keywords: string[]; course_ids: string[]; position: number; active: boolean }

describe.skipIf(!migrations)('trilhas (SQL)', () => {
  let db: Db
  let editor: string
  let ana: string
  const EDITOR = () => ({ uid: editor, aal: 'aal2' as const })

  const ok = <T>(r: { ok: true; data: T } | { ok: false; code: string; message: string }): T => {
    if (!r.ok) throw new Error(r.code + ' ' + r.message)
    return r.data
  }
  const trail = (over: Record<string, unknown> = {}) => ({
    id: 'dados',
    title: 'Trabalhar com dados',
    blurb: 'Ler números e contar histórias com eles.',
    icon: 'ChartColumn',
    skills: ['Dados', 'Tecnologia'],
    keywords: ['dados', 'análise'],
    courseIds: [],
    active: true,
    ...over,
  })
  const save = (session: { uid: string; aal?: 'aal1' | 'aal2' }, t: Record<string, unknown>, isNew: boolean) =>
    rpc<{ id: string }>(db, session, 'select public.admin_save_trail($1::jsonb, $2) as r', [JSON.stringify(t), isNew])
  const list = async (uid = ana) => (await as(db, { uid }, (tx) => tx.query<Row>('select id, title, icon, skills, keywords, course_ids, position, active from public.trails order by position, id'))).rows
  const failure = async (r: ReturnType<typeof save>) => {
    const x = await r
    return x.ok ? null : x.code
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    editor = await createUser(db, 'edu@folyo.test')
    ana = await createUser(db, 'ana@folyo.test')
    await setRole(db, editor, 'editor')
    for (const id of ['mkt', 'vnd']) {
      await db.query(`insert into public.courses (id, title, category_id, summary, status) values ($1, $2, 'marketing', 'Resumo do curso para o teste.', 'publicado')`, [id, 'Curso ' + id])
    }
  }, 120_000)

  test('as 7 trilhas de sempre já existem, na ordem de sempre, e o aluno consegue ler', async () => {
    const rows = await list()
    expect(rows.map((r) => r.id)).toEqual(['marketing', 'vendas', 'familia', 'programacao', 'estagio', 'ingles', 'criativo'])
    expect(rows[0]).toMatchObject({ title: 'Construir carreira em Marketing', icon: 'Megaphone', skills: ['Marketing', 'Comunicação'], course_ids: [], active: true })
  })

  test('o aluno não grava direto na tabela nem chama as funções do painel', async () => {
    const insert = as(db, { uid: ana }, (tx) => tx.query(`insert into public.trails (id, title) values ('hack', 'Trilha do aluno')`))
    await expect(insert).rejects.toMatchObject({ code: '42501' })
    const update = as(db, { uid: ana }, (tx) => tx.query(`update public.trails set title = 'Trocada' where id = 'marketing'`))
    await expect(update).rejects.toMatchObject({ code: '42501' })
    expect(await failure(save({ uid: ana }, trail(), true))).not.toBeNull()
    expect((await rpc(db, { uid: ana }, `select public.admin_delete_trail('marketing') as r`)).ok).toBe(false)
    expect((await rpc(db, { uid: ana }, `select public.admin_reorder_trails(array['vendas','marketing']) as r`)).ok).toBe(false)
  })

  test('o editor cria uma trilha com cursos escolhidos à mão, na ordem pedida', async () => {
    ok(await save(EDITOR(), trail({ courseIds: ['vnd', 'mkt'] }), true))
    const row = (await list()).find((r) => r.id === 'dados')!
    expect(row).toMatchObject({ title: 'Trabalhar com dados', icon: 'ChartColumn', course_ids: ['vnd', 'mkt'], position: 7, active: true })
  })

  test('endereço repetido (FA410), nome repetido (FA400) e curso que não existe (FA404) são recusados', async () => {
    expect(await failure(save(EDITOR(), trail(), true))).toBe('FA410')
    expect(await failure(save(EDITOR(), trail({ id: 'outra', title: '  TRABALHAR com dados ' }), true))).toBe('FA400')
    expect(await failure(save(EDITOR(), trail({ id: 'outra', title: 'Outra trilha', courseIds: ['nao-existe'] }), true))).toBe('FA404')
  })

  test('dados fora do formato são recusados', async () => {
    const bad = [
      trail({ id: 'Maiúscula!', title: 'Trilha estranha' }),
      trail({ id: 'x1', title: 'ab' }),
      trail({ id: 'x2', title: 'Ícone ruim', icon: 'drop table' }),
      trail({ id: 'x3', title: 'Skills demais', skills: Array.from({ length: 11 }, (_, i) => 'Skill ' + i) }),
      trail({ id: 'x4', title: 'Curso inválido', courseIds: ['A B'] }),
      trail({ id: 'x5', title: 'Descrição longa', blurb: 'a'.repeat(201) }),
    ]
    for (const t of bad) expect(await failure(save(EDITOR(), t, true)), String(t.title)).toBe('FA400')
  })

  test('editar muda os campos, mantém a posição e sumir um curso da lista é só salvar sem ele', async () => {
    ok(await save(EDITOR(), trail({ title: 'Dados e análise', courseIds: ['mkt'], active: false }), false))
    const row = (await list()).find((r) => r.id === 'dados')!
    expect(row).toMatchObject({ title: 'Dados e análise', course_ids: ['mkt'], position: 7, active: false })
    expect(await failure(save(EDITOR(), trail({ id: 'nao-existe', title: 'Fantasma' }), false))).toBe('FA404')
  })

  test('reordenar grava a nova ordem e recusa lista com repetidos ou com id que não existe', async () => {
    const ids = (await list()).map((r) => r.id)
    const next = [ids[ids.length - 1], ...ids.slice(0, -1)]
    ok(await rpc(db, EDITOR(), 'select public.admin_reorder_trails($1::text[]) as r', [next]))
    expect((await list()).map((r) => r.id)).toEqual(next)
    expect((await rpc(db, EDITOR(), `select public.admin_reorder_trails(array['dados','dados']) as r`)).ok).toBe(false)
    expect((await rpc(db, EDITOR(), `select public.admin_reorder_trails(array['dados','fantasma']) as r`)).ok).toBe(false)
  })

  test('não exclui trilha que algum aluno escolheu; exclui a que ninguém usa', async () => {
    await db.query(`update public.profiles set goal_primary = 'marketing' where id = $1`, [ana])
    const blocked = await rpc(db, EDITOR(), `select public.admin_delete_trail('marketing') as r`)
    expect(blocked).toMatchObject({ ok: false, code: 'FA400' })
    expect(!blocked.ok && blocked.message).toMatch(/1 aluno escolheu/)

    await db.query(`update public.profiles set goal_primary = null, goals_secondary = array['vendas'] where id = $1`, [ana])
    expect((await rpc(db, EDITOR(), `select public.admin_delete_trail('vendas') as r`)).ok).toBe(false)

    await db.query(`update public.profiles set goals_secondary = '{}' where id = $1`, [ana])
    ok(await rpc(db, EDITOR(), `select public.admin_delete_trail('dados') as r`))
    expect((await list()).some((r) => r.id === 'dados')).toBe(false)
    expect((await rpc(db, EDITOR(), `select public.admin_delete_trail('dados') as r`)).ok).toBe(false)
  })

  test('o histórico do painel (filtro Conteúdo) lista as trilhas', async () => {
    const boss = await createUser(db, 'chefe@folyo.test')
    await setRole(db, boss, 'admin')
    const r = ok(await rpc<{ action: string }[]>(db, { uid: boss, aal: 'aal2' }, `select public.admin_audit_log('conteudo', 100) as r`))
    expect(r.map((x) => x.action)).toEqual(expect.arrayContaining(['trilha.criada', 'trilhas.reordenadas']))
  })

  test('tudo fica no histórico do painel', async () => {
    const { rows } = await db.query<{ action: string }>(`select action from private.admin_audit where action like 'trilha%' order by at, id`)
    const actions = rows.map((r) => r.action)
    expect(actions).toContain('trilha.criada')
    expect(actions).toContain('trilha.atualizada')
    expect(actions).toContain('trilhas.reordenadas')
    expect(actions).toContain('trilha.excluida')
  })
})
