import 'server-only'
import { cache } from 'react'
import type { AdminCatalog } from '@/lib/admin/catalog'
import {
  adminCatalogFromRows,
  CATEGORY_COLUMNS,
  COURSE_COLUMNS,
  COURSE_SALE_COLUMNS,
  LESSON_COLUMNS,
  LESSON_VIDEO_COLUMNS,
  MATERIAL_COLUMNS,
  MEDIA_COLUMNS,
  mediaFromRows,
  MODULE_COLUMNS,
  studentCatalog,
  TRAIL_COLUMNS,
  trailsFromRows,
  type CatalogRows,
} from '@/lib/domain/catalog-rows'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { MediaItem } from '@/lib/media'
import type { Trail } from '@/lib/trails'
import type { Catalog } from '@/lib/types'

/**
 * Camada de acesso a dados do CATÁLOGO (categorias, cursos, módulos, aulas e materiais).
 *
 * `server-only` garante que este arquivo nunca vai parar no navegador.
 *
 * A leitura acontece "como a pessoa logada": o banco só entrega o que o papel dela pode ver
 * (aluno: cursos publicados; equipe: tudo, inclusive rascunhos). Por isso o catálogo NÃO
 * fica em cache compartilhado: cada pedido consulta o banco. `cache` do React só evita repetir
 * a consulta várias vezes na mesma página.
 *
 * Nada de "select *": cada coluna lida está listada em src/lib/domain/catalog-rows.ts.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

const PAGE = 1000
/** Teto de segurança: o painel limita 500 cursos × 400 aulas, mas ninguém precisa de tudo isso numa página. */
const MAX_ROWS = 20000

class CatalogReadError extends Error {
  constructor(readonly code: string | undefined) {
    super('Não foi possível carregar os cursos agora.')
  }
}

/** Lê uma tabela inteira, de mil em mil linhas (o Supabase corta respostas em 1000 por padrão). */
async function fetchAll(supabase: Supabase, table: string, columns: string, orderBy: string, quiet = false): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      if (!quiet) console.error('Falha ao carregar o catálogo', { table, code: error.code })
      throw new CatalogReadError(error.code)
    }
    out.push(...(data as unknown[]))
    if (data.length < PAGE) break
  }
  return out
}

/** 42703 = coluna não existe; 42501 = sem permissão; PGRST202 = função não existe. */
const notMigrated = (code: string | undefined) => code === '42703' || code === '42501' || code === 'PGRST202'

/**
 * Preço e "liberar com cupom" de cada curso. Antes do SQL do cupom de lançamento as colunas não
 * existem: aí todo curso vale como gratuito (exatamente como era).
 */
async function saleRows(supabase: Supabase): Promise<unknown[]> {
  try {
    return await fetchAll(supabase, 'courses', COURSE_SALE_COLUMNS, 'position', true)
  } catch (error) {
    if (error instanceof CatalogReadError && notMigrated(error.code)) return []
    throw error
  }
}

/**
 * Trilhas de carreira. Antes do SQL das trilhas a tabela não existe: aí devolve `undefined` e valem
 * as 7 trilhas de sempre (src/lib/trails.ts).
 */
async function trailRows(supabase: Supabase): Promise<unknown[] | undefined> {
  const { data, error } = await supabase.from('trails').select(TRAIL_COLUMNS).order('position').order('id').limit(100)
  if (!error) return data as unknown[]
  // 42P01 = tabela não existe; PGRST205 = a API ainda não conhece a tabela.
  if (error.code === '42P01' || error.code === 'PGRST205' || notMigrated(error.code)) return undefined
  console.error('Falha ao carregar as trilhas', { code: error.code })
  return undefined
}

/**
 * Vídeo das aulas. Depois do SQL do cupom de lançamento, só pela função lesson_videos(), que entrega
 * apenas o vídeo dos cursos que a pessoa pode assistir (curso pago sem acesso = sem vídeo). Antes
 * desse SQL, lê direto da tabela, como sempre foi.
 */
async function videoRows(supabase: Supabase): Promise<unknown[]> {
  const { data, error } = await supabase.rpc('lesson_videos')
  if (!error) return Array.isArray(data) ? data : []
  if (error.code !== 'PGRST202') {
    console.error('Falha ao carregar os vídeos', { code: error.code })
    throw new CatalogReadError(error.code)
  }
  return fetchAll(supabase, 'lessons', LESSON_VIDEO_COLUMNS, 'position')
}

/** Junta as colunas lidas à parte (preço, vídeo) na linha principal, pelo id. */
function mergeById(rows: unknown[], extra: unknown[]): unknown[] {
  const byId = new Map<string, Record<string, unknown>>()
  for (const row of extra) {
    if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string') byId.set((row as { id: string }).id, row as Record<string, unknown>)
  }
  return rows.map((row) => {
    const id = (row as { id?: unknown })?.id
    const more = typeof id === 'string' ? byId.get(id) : undefined
    return more ? { ...(row as Record<string, unknown>), ...more } : row
  })
}

const rawRows = cache(async (): Promise<CatalogRows> => {
  const supabase = await createSupabaseServerClient()
  const [categories, courses, sale, modules, lessons, videos, materials, media, trails] = await Promise.all([
    fetchAll(supabase, 'categories', CATEGORY_COLUMNS, 'position'),
    fetchAll(supabase, 'courses', COURSE_COLUMNS, 'position'),
    saleRows(supabase),
    fetchAll(supabase, 'course_modules', MODULE_COLUMNS, 'position'),
    fetchAll(supabase, 'lessons', LESSON_COLUMNS, 'position'),
    videoRows(supabase),
    fetchAll(supabase, 'lesson_materials', MATERIAL_COLUMNS, 'position'),
    fetchAll(supabase, 'media_files', MEDIA_COLUMNS, 'created_at'),
    trailRows(supabase),
  ])
  return { categories, courses: mergeById(courses, sale), modules, lessons: mergeById(lessons, videos), materials, media, trails }
})

/** Tags sugeridas (a RLS só deixa a equipe ler; para o aluno vem vazio). */
async function readTags(): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('catalog_tags').select('tag').order('tag').limit(200)
  if (error) {
    console.error('Falha ao carregar as tags', { code: error.code })
    return []
  }
  return (data ?? []).map((r) => String((r as { tag: unknown }).tag))
}

/**
 * Catálogo como o ALUNO vê: só cursos publicados (ou despublicados, para quem já começou),
 * sem módulos arquivados, sem aulas despublicadas e sem cursos vazios. O filtro é feito aqui
 * também, não só no banco, para que uma pessoa da equipe veja no site o mesmo que os alunos.
 */
export const getCatalog = cache(async (): Promise<Catalog> => {
  const rows = await rawRows()
  return studentCatalog(adminCatalogFromRows(rows), Date.now(), mediaFromRows(rows.media ?? []), trailsFromRows(rows.trails))
})

/** Trilhas para o painel (as cadastradas, ativas ou não). `saved` = false enquanto o SQL das trilhas não foi rodado. */
export const getTrails = cache(async (): Promise<{ trails: Trail[]; saved: boolean }> => {
  const rows = (await rawRows()).trails
  return { trails: trailsFromRows(rows), saved: rows !== undefined }
})

/** Biblioteca de mídia inteira (só a equipe lê arquivos que não aparecem para o aluno). */
export const getMediaLibrary = cache(async (): Promise<MediaItem[]> => mediaFromRows((await rawRows()).media ?? []))

/** Catálogo completo para o painel (rascunhos, agendados e arquivados). Só chamar depois de conferir o papel. */
export const getFullCatalog = cache(async (): Promise<AdminCatalog> => {
  const [rows, tags] = await Promise.all([rawRows(), readTags()])
  return adminCatalogFromRows(rows, tags)
})
