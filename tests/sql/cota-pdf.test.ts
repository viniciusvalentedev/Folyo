import { beforeAll, describe, expect, test } from 'vitest'
import { as, createDb, createUser, loadMigrations, type Db } from './db'

/**
 * Cota de PDFs pelo tamanho REAL (migration 20261104000001).
 *
 * O aluno grava a própria linha em works (com o token dele, direto na API). Antes, o file_size que ele mandava era
 * o que valia para a cota de 300 MB. Aqui conferimos que o banco usa o tamanho guardado no Storage, recusa arquivo
 * que não existe ou não é PDF e refaz a conta quando o arquivo do trabalho é trocado.
 */

const migrations = loadMigrations()
const MB = 1024 * 1024

describe.skipIf(!migrations)('cota de PDFs (tamanho real do Storage)', () => {
  let db: Db
  let ana: string
  let bia: string

  /** Simula um envio ao Storage (o que o Supabase grava depois do upload). Devolve o caminho. */
  async function upload(uid: string, bytes: number, mime = 'application/pdf') {
    const path = `${uid}/${crypto.randomUUID()}.pdf`
    await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('student-works', $1, $2, $3)`, [
      path,
      uid,
      JSON.stringify({ size: bytes, mimetype: mime }),
    ])
    return path
  }

  /** O aluno cria o trabalho direto na tabela, dizendo o tamanho que quiser. */
  async function insertWork(uid: string, path: string, declared: number) {
    const id = crypto.randomUUID()
    try {
      await as(db, { uid }, (tx) =>
        tx.query(`insert into public.works (id, kind, title, file_path, file_name, file_size) values ($1, 'pdf', 'Trabalho', $2, 'a.pdf', $3)`, [
          id,
          path,
          declared,
        ]),
      )
      return { ok: true as const, id }
    } catch (error) {
      return { ok: false as const, message: (error as Error).message }
    }
  }

  const sizeOf = async (id: string) =>
    Number((await db.query<{ s: string }>('select file_size::text as s from public.works where id = $1', [id])).rows[0]?.s)

  beforeAll(async () => {
    db = await createDb(migrations!)
    ana = await createUser(db, 'ana@folyo.test')
    bia = await createUser(db, 'bia@folyo.test')
  }, 120_000)

  test('o tamanho gravado é o do Storage, não o que o aluno mandou', async () => {
    const path = await upload(ana, 15 * MB)
    const r = await insertWork(ana, path, 5)
    expect(r.ok).toBe(true)
    if (r.ok) expect(await sizeOf(r.id)).toBe(15 * MB)
  })

  test('mentir o tamanho não fura os 300 MB', async () => {
    // Ana já tem 15 MB. Mais 19 PDFs de 15 MB = 300 MB no total: cabe certinho.
    for (let i = 0; i < 19; i++) {
      const r = await insertWork(ana, await upload(ana, 15 * MB), 5)
      expect(r.ok).toBe(true)
    }
    const over = await insertWork(ana, await upload(ana, 1 * MB), 5)
    expect(over).toMatchObject({ ok: false, message: expect.stringContaining('300 MB') })
  })

  test('arquivo que não existe no Storage é recusado', async () => {
    const r = await insertWork(bia, `${bia}/${crypto.randomUUID()}.pdf`, 10)
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('Não encontramos o arquivo') })
  })

  test('arquivo que o Storage não guardou como PDF é recusado', async () => {
    const r = await insertWork(bia, await upload(bia, 2 * MB, 'image/png'), 10)
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining('não parece ser um PDF') })
  })

  test('trocar o arquivo do trabalho refaz a conta com o tamanho do arquivo novo', async () => {
    const first = await insertWork(bia, await upload(bia, 1 * MB), 1 * MB)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const bigger = await upload(bia, 18 * MB)
    // Troca só o file_path, mantendo o tamanho antigo (antes o gatilho nem rodava nesse caso).
    await as(db, { uid: bia }, (tx) => tx.query('update public.works set file_path = $1 where id = $2', [bigger, first.id]))
    expect(await sizeOf(first.id)).toBe(18 * MB)
  })

  test('mudar só o título não exige nada do Storage', async () => {
    const r = await insertWork(bia, await upload(bia, 2 * MB), 2 * MB)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    await as(db, { uid: bia }, (tx) => tx.query(`update public.works set title = 'Novo título' where id = $1`, [r.id]))
    const t = await db.query<{ title: string }>('select title from public.works where id = $1', [r.id])
    expect(t.rows[0].title).toBe('Novo título')
  })

  test('link continua sem arquivo e sem cota', async () => {
    await as(db, { uid: bia }, (tx) =>
      tx.query(`insert into public.works (id, kind, title, url) values ($1, 'link', 'Meu site', 'https://exemplo.com')`, [crypto.randomUUID()]),
    )
  })

  test('o aluno não chama a função da cota direto', async () => {
    const r = await db.query<{ ok: boolean }>(`select has_function_privilege('authenticated', 'private.works_quota()', 'execute') as ok`)
    expect(r.rows[0].ok).toBe(false)
  })
})
