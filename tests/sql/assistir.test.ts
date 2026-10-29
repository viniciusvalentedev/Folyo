import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, type Db } from './db'

/**
 * Concluir aula NÃO depende do tempo assistido no banco: a pessoa pode pular trechos e a conferência
 * "só conclui no final do vídeo" é feita na tela. Este teste garante que nenhuma migration volta a barrar a conclusão.
 */

const migrations = loadMigrations()

describe.skipIf(!migrations)('concluir aula (SQL)', () => {
  let db: Db
  let ana: string

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    await db.query(`insert into public.courses (id, title, category_id, summary, status) values ('mkt', 'Marketing na prática', 'marketing', 'Resumo do curso para o teste.', 'publicado')`)
    await db.query(`insert into public.course_modules (id, course_id, title, position) values ('mkt-m1', 'mkt', 'Módulo 1', 0)`)
    await db.query(
      `insert into public.lessons (id, module_id, course_id, title, minutes, position, video_kind, bunny_video_id)
       values ('mkt-a1', 'mkt-m1', 'mkt', 'Aula de teste', 10, 0, 'bunny', $1)`,
      [crypto.randomUUID()],
    )
  }, 120_000)

  test('aula em vídeo do Bunny pode ser concluída sem tempo assistido gravado', async () => {
    await as(db, { uid: ana }, (tx) => tx.query(`insert into public.lesson_completions (course_id, lesson_id) values ('mkt', 'mkt-a1')`))
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.lesson_completions where lesson_id = 'mkt-a1'`)
    expect(rows[0].n).toBe(1)
  })

  test('não sobra o gatilho da regra antiga', async () => {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pg_trigger where tgname = 'lesson_completion_guard'`)
    expect(rows[0].n).toBe(0)
  })
})
