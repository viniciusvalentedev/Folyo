import 'server-only'
import { cache } from 'react'
import type { AdminCatalog } from '@/lib/admin/catalog'
import {
  adminCatalogFromRows,
  CATEGORY_COLUMNS,
  COURSE_COLUMNS,
  LESSON_COLUMNS,
  MATERIAL_COLUMNS,
  MEDIA_COLUMNS,
  mediaFromRows,
  MODULE_COLUMNS,
  studentCatalog,
  type CatalogRows,
} from '@/lib/domain/catalog-rows'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { MediaItem } from '@/lib/media'
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

/** Lê uma tabela inteira, de mil em mil linhas (o Supabase corta respostas em 1000 por padrão). */
async function fetchAll(supabase: Supabase, table: string, columns: string, orderBy: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      console.error('Falha ao carregar o catálogo', { table, code: error.code })
      throw new Error('Não foi possível carregar os cursos agora.')
    }
    out.push(...(data as unknown[]))
    if (data.length < PAGE) break
  }
  return out
}

const rawRows = cache(async (): Promise<CatalogRows> => {
  const supabase = await createSupabaseServerClient()
  const [categories, courses, modules, lessons, materials, media] = await Promise.all([
    fetchAll(supabase, 'categories', CATEGORY_COLUMNS, 'position'),
    fetchAll(supabase, 'courses', COURSE_COLUMNS, 'position'),
    fetchAll(supabase, 'course_modules', MODULE_COLUMNS, 'position'),
    fetchAll(supabase, 'lessons', LESSON_COLUMNS, 'position'),
    fetchAll(supabase, 'lesson_materials', MATERIAL_COLUMNS, 'position'),
    fetchAll(supabase, 'media_files', MEDIA_COLUMNS, 'created_at'),
  ])
  return { categories, courses, modules, lessons, materials, media }
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
  return studentCatalog(adminCatalogFromRows(rows), Date.now(), mediaFromRows(rows.media ?? []))
})

/** Biblioteca de mídia inteira (só a equipe lê arquivos que não aparecem para o aluno). */
export const getMediaLibrary = cache(async (): Promise<MediaItem[]> => mediaFromRows((await rawRows()).media ?? []))

/** Catálogo completo para o painel (rascunhos, agendados e arquivados). Só chamar depois de conferir o papel. */
export const getFullCatalog = cache(async (): Promise<AdminCatalog> => {
  const [rows, tags] = await Promise.all([rawRows(), readTags()])
  return adminCatalogFromRows(rows, tags)
})
