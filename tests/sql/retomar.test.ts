import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, type Db } from './db'

/**
 * "Continuar de onde parou", rodando as migrations DE VERDADE (Postgres em memória): o aluno grava o
 * ponto do vídeo na própria linha de lesson_watch e só ele enxerga.
 */

const migrations = loadMigrations()

describe.skipIf(!migrations)('continuar de onde parou (SQL)', () => {
  let db: Db
  let ana: string
  let beto: string

  const code = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      return null
    } catch (error) {
      return (error as { code?: string }).code ?? 'erro'
    }
  }
  const positionOf = async (uid: string, lesson = 'mkt-a1') => {
    const { rows } = await as(db, { uid }, (tx) =>
      tx.query<{ position: number; seconds: number }>('select position, seconds from public.lesson_watch where lesson_id = $1', [lesson]),
    )
    return rows[0] ?? null
  }

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    beto = await createUser(db, 'beto@folyo.test')
  }, 120_000)

  test('a aula começa sem ponto salvo (0 = início)', async () => {
    expect(await positionOf(ana)).toBeNull()
  })

  test('o aluno grava o ponto onde parou junto com o tempo assistido', async () => {
    await as(db, { uid: ana }, (tx) =>
      tx.query(`insert into public.lesson_watch (course_id, lesson_id, seconds, position) values ('mkt', 'mkt-a1', 180, 180)`),
    )
    const row = await positionOf(ana)
    // O primeiro registro tem o tempo limitado a 300 s; 180 s passa direto.
    expect(row).toEqual({ position: 180, seconds: 180 })
  })

  test('voltar à aula e parar em outro ponto atualiza só o ponto (o tempo assistido não anda)', async () => {
    await as(db, { uid: ana }, (tx) => tx.query(`update public.lesson_watch set position = 95 where lesson_id = 'mkt-a1'`))
    expect(await positionOf(ana)).toEqual({ position: 95, seconds: 180 })
  })

  test('pular para frente não conta como tempo assistido: o limite do relógio continua valendo', async () => {
    await as(db, { uid: ana }, (tx) => tx.query(`update public.lesson_watch set seconds = 9000, position = 5000 where lesson_id = 'mkt-a1'`))
    const row = await positionOf(ana)
    expect(row!.position).toBe(5000)
    expect(row!.seconds).toBeLessThan(250)
  })

  test('o ponto precisa estar entre 0 e 86400', async () => {
    expect(await code(() => as(db, { uid: ana }, (tx) => tx.query(`update public.lesson_watch set position = -1 where lesson_id = 'mkt-a1'`)))).toBe('23514')
    expect(await code(() => as(db, { uid: ana }, (tx) => tx.query(`update public.lesson_watch set position = 86401 where lesson_id = 'mkt-a1'`)))).toBe('23514')
  })

  test('cada aluno enxerga e altera só o próprio ponto', async () => {
    expect(await positionOf(beto)).toBeNull()
    await as(db, { uid: beto }, (tx) => tx.query(`update public.lesson_watch set position = 1 where lesson_id = 'mkt-a1'`))
    expect((await positionOf(ana))!.position).toBe(5000)
  })
})
