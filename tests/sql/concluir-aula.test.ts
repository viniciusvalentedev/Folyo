import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, rpc, setRole, type Db } from './db'

/**
 * complete_lesson: o ÚNICO jeito de o aluno concluir uma aula (migration 20261103000002).
 *
 * Roda a migration de verdade (Postgres em memória) por cima de todas as anteriores e cobre o que importa para
 * a segurança: ordem das aulas, acesso ao curso pago e as tentativas de burlar com o token do próprio aluno
 * (gravar direto na tabela, aula de outro curso, aula em rascunho). Também confere que o caminho normal continua
 * funcionando até o perfil público mostrar o curso concluído e com certificado.
 */

const migrations = loadMigrations()

type Done = { done: boolean; already: boolean }
type PublicCourse = { id: string; complete: boolean; certified: boolean }

describe.skipIf(!migrations)('concluir aula (complete_lesson)', () => {
  let db: Db
  let owner: string
  let editor: string
  let ana: string
  let bia: string
  let caio: string

  const complete = (session: { uid: string; aal?: 'aal1' | 'aal2' }, course: string, lesson: string) =>
    rpc<Done>(db, session, 'select public.complete_lesson($1, $2) as r', [course, lesson])
  const doneIds = async (uid: string) => {
    const r = await db.query<{ lesson_id: string }>('select lesson_id from public.lesson_completions where user_id = $1 order by lesson_id', [uid])
    return r.rows.map((x) => x.lesson_id)
  }
  const ok = <T>(r: { ok: true; data: T } | { ok: false; message: string }): T => {
    if (!r.ok) throw new Error(r.message)
    return r.data
  }

  /** Curso com dois módulos. A ordem vem da posição, não do id: o módulo "b" vem antes do "a". */
  async function addCourse(id: string) {
    await db.query(`insert into public.courses (id, title, category_id, summary, status, cert_enabled) values ($1, $2, 'marketing', 'Resumo do curso para o teste.', 'publicado', true)`, [
      id,
      'Curso ' + id,
    ])
    await db.query(
      `insert into public.course_modules (id, course_id, title, position, archived) values
         ($1 || '-mb', $1, 'Primeiro módulo', 0, false),
         ($1 || '-ma', $1, 'Segundo módulo', 1, false),
         ($1 || '-mx', $1, 'Módulo arquivado', 2, true)`,
      [id],
    )
    await db.query(
      `insert into public.lessons (id, module_id, course_id, title, minutes, position, published) values
         ($1 || '-a1', $1 || '-mb', $1, 'Aula 1', 10, 0, true),
         ($1 || '-a2', $1 || '-mb', $1, 'Aula 2', 10, 1, true),
         ($1 || '-rascunho', $1 || '-mb', $1, 'Aula em rascunho', 10, 2, false),
         ($1 || '-a3', $1 || '-ma', $1, 'Aula 3', 10, 0, true),
         ($1 || '-velha', $1 || '-mx', $1, 'Aula de módulo arquivado', 10, 0, true)`,
      [id],
    )
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    owner = await createUser(db, 'dona@folyo.test')
    editor = await createUser(db, 'edu@folyo.test')
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
    caio = await createUser(db, 'caio@folyo.test')
    await setRole(db, owner, 'proprietario')
    await setRole(db, editor, 'editor')
    await addCourse('gratis')
    await addCourse('pago')
    ok(await rpc(db, { uid: owner, aal: 'aal2' }, 'select public.admin_set_course_sale($1, $2, $3) as r', ['pago', 4990, false]))
  }, 120_000)

  describe('ordem das aulas', () => {
    test('a primeira aula conclui; pular para a seguinte é recusado', async () => {
      expect(ok(await complete({ uid: ana }, 'gratis', 'gratis-a1'))).toEqual({ done: true, already: false })
      const skip = await complete({ uid: ana }, 'gratis', 'gratis-a3')
      expect(skip).toMatchObject({ ok: false, code: 'FC422' })
      expect(await doneIds(ana)).toEqual(['gratis-a1'])
    })

    test('na ordem certa conclui o curso inteiro, atravessando o módulo', async () => {
      ok(await complete({ uid: ana }, 'gratis', 'gratis-a2'))
      ok(await complete({ uid: ana }, 'gratis', 'gratis-a3'))
      expect(await doneIds(ana)).toEqual(['gratis-a1', 'gratis-a2', 'gratis-a3'])
    })

    test('concluir de novo não muda nada (nem a data)', async () => {
      const before = await db.query<{ t: string }>(`select completed_at::text as t from public.lesson_completions where user_id = $1 and lesson_id = 'gratis-a1'`, [ana])
      expect(ok(await complete({ uid: ana }, 'gratis', 'gratis-a1'))).toEqual({ done: true, already: true })
      const after = await db.query<{ t: string }>(`select completed_at::text as t from public.lesson_completions where user_id = $1 and lesson_id = 'gratis-a1'`, [ana])
      expect(after.rows[0].t).toBe(before.rows[0].t)
    })

    test('aula já concluída continua valendo mesmo se a anterior for desmarcada', async () => {
      await as(db, { uid: ana }, (tx) => tx.query(`delete from public.lesson_completions where lesson_id = 'gratis-a2'`))
      expect(ok(await complete({ uid: ana }, 'gratis', 'gratis-a3'))).toEqual({ done: true, already: true })
      // Mas, desmarcada, a aula 3 só volta depois da 2.
      await as(db, { uid: ana }, (tx) => tx.query(`delete from public.lesson_completions where lesson_id = 'gratis-a3'`))
      expect(await complete({ uid: ana }, 'gratis', 'gratis-a3')).toMatchObject({ ok: false, code: 'FC422' })
      ok(await complete({ uid: ana }, 'gratis', 'gratis-a2'))
      ok(await complete({ uid: ana }, 'gratis', 'gratis-a3'))
    })

    test('aula em rascunho e de módulo arquivado não contam na ordem nem podem ser concluídas', async () => {
      expect(await complete({ uid: ana }, 'gratis', 'gratis-rascunho')).toMatchObject({ ok: false, code: 'FA404' })
      expect(await complete({ uid: ana }, 'gratis', 'gratis-velha')).toMatchObject({ ok: false, code: 'FA404' })
    })
  })

  describe('acesso ao curso', () => {
    test('curso pago sem acesso: recusado, mesmo a primeira aula', async () => {
      expect(await complete({ uid: bia }, 'pago', 'pago-a1')).toMatchObject({ ok: false, code: 'FA403' })
      expect(await doneIds(bia)).toEqual([])
    })

    test('com acesso liberado, conclui na ordem', async () => {
      ok(await rpc(db, { uid: owner, aal: 'aal2' }, 'select public.admin_grant_course_access($1, $2) as r', [bia, 'pago']))
      ok(await complete({ uid: bia }, 'pago', 'pago-a1'))
      expect(await complete({ uid: bia }, 'pago', 'pago-a3')).toMatchObject({ ok: false, code: 'FC422' })
    })

    test('conta suspensa não conclui', async () => {
      await db.query(`insert into private.suspensions (user_id, reason) values ($1, 'teste')`, [caio])
      expect(await complete({ uid: caio }, 'gratis', 'gratis-a1')).toMatchObject({ ok: false, code: 'FA403' })
      await db.query(`delete from private.suspensions where user_id = $1`, [caio])
    })

    test('sem login não chama a função', async () => {
      const r = await rpc(db, { uid: null }, `select public.complete_lesson('gratis', 'gratis-a1') as r`)
      expect(r).toMatchObject({ ok: false, code: '42501' })
    })
  })

  describe('tentativas de burlar com o token do aluno', () => {
    test('gravar direto em lesson_completions é recusado', async () => {
      const r = await rpc(db, { uid: caio }, `insert into public.lesson_completions (course_id, lesson_id) values ('gratis', 'gratis-a3') returning 1 as r`)
      expect(r).toMatchObject({ ok: false, code: '42501' })
      const forged = await rpc(db, { uid: caio }, `insert into public.lesson_completions (user_id, course_id, lesson_id) values ($1, 'gratis', 'gratis-a1') returning 1 as r`, [caio])
      expect(forged).toMatchObject({ ok: false, code: '42501' })
    })

    test('alterar uma conclusão (data, aula) é recusado', async () => {
      const r = await rpc(db, { uid: ana }, `update public.lesson_completions set completed_at = now() - interval '1 year', lesson_id = 'pago-a3' where user_id = $1 returning 1 as r`, [ana])
      expect(r).toMatchObject({ ok: false, code: '42501' })
    })

    test('aula de outro curso, curso inexistente ou id malformado: recusado', async () => {
      expect(await complete({ uid: caio }, 'gratis', 'pago-a1')).toMatchObject({ ok: false, code: 'FA404' })
      expect(await complete({ uid: caio }, 'nao-existe', 'gratis-a1')).toMatchObject({ ok: false, code: 'FA404' })
      expect(await complete({ uid: caio }, 'gratis', "x'; drop table x; --")).toMatchObject({ ok: false, code: 'FA400' })
      expect(await doneIds(caio)).toEqual([])
    })

    test('equipe SEM a verificação em duas etapas segue a regra do aluno', async () => {
      expect(await complete({ uid: editor, aal: 'aal1' }, 'gratis', 'gratis-a3')).toMatchObject({ ok: false, code: 'FC422' })
    })

    test('a função não fica aberta para visitantes nem para a chave secreta', async () => {
      const r = await db.query<{ anon: boolean; auth: boolean; service: boolean }>(
        `select has_function_privilege('anon', 'public.complete_lesson(text, text)', 'execute') as anon,
                has_function_privilege('authenticated', 'public.complete_lesson(text, text)', 'execute') as auth,
                has_function_privilege('service_role', 'public.complete_lesson(text, text)', 'execute') as service`,
      )
      expect(r.rows[0]).toEqual({ anon: false, auth: true, service: false })
      const cols = await db.query<{ n: number }>(
        `select count(*)::int as n from information_schema.column_privileges
          where table_schema = 'public' and table_name = 'lesson_completions' and grantee = 'authenticated'
            and privilege_type in ('INSERT', 'UPDATE')`,
      )
      expect(cols.rows[0].n).toBe(0)
    })
  })

  describe('equipe', () => {
    test('com a verificação em duas etapas, conclui fora de ordem (para testar o curso)', async () => {
      ok(await complete({ uid: editor, aal: 'aal2' }, 'pago', 'pago-a3'))
      ok(await complete({ uid: editor, aal: 'aal2' }, 'gratis', 'gratis-rascunho'))
      expect(await doneIds(editor)).toEqual(['gratis-rascunho', 'pago-a3'])
    })
  })

  describe('caminho normal até o perfil público', () => {
    test('desmarcar a própria aula continua funcionando', async () => {
      await as(db, { uid: bia }, (tx) => tx.query(`delete from public.lesson_completions where lesson_id = 'pago-a1'`))
      expect(await doneIds(bia)).toEqual([])
    })

    test('curso concluído pela função aparece concluído e com certificado no perfil público', async () => {
      expect(ok(await rpc<string>(db, { uid: ana }, `select public.set_my_slug('ana-teste') as r`))).toBe('ok')
      await db.query('update public.profiles set public_profile = true, onboarded = true where id = $1', [ana])
      const profile = ok(await rpc<{ courses: PublicCourse[] }>(db, { uid: null }, `select public.get_public_profile('ana-teste') as r`))
      expect(profile.courses).toEqual([expect.objectContaining({ id: 'gratis', complete: true, certified: true })])
    })
  })
})
