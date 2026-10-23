import 'server-only'
import { cacheLife } from 'next/cache'
import { categories, courses } from '@/lib/mock/catalog'
import type { Catalog } from '@/lib/types'

/**
 * Camada de acesso a dados do CATÁLOGO (cursos e categorias).
 *
 * `server-only` garante que este arquivo nunca vai parar no navegador: se algum
 * componente do lado do cliente tentar importar, o build quebra. É aqui que, na
 * próxima etapa, entram as consultas ao Supabase.
 *
 * O catálogo é igual para todo mundo, então pode ficar em cache ('use cache').
 */
export async function getCatalog(): Promise<Catalog> {
  'use cache'
  cacheLife('hours')
  // Próxima etapa: buscar no Supabase só cursos publicados, por exemplo:
  // const { data } = await supabase.from('courses').select('*, modules(*, lessons(*))').eq('status', 'publicado')
  return { courses, categories }
}

/** Ids usados para gerar as páginas de curso e aula no build. */
export async function getCourseParams() {
  const { courses } = await getCatalog()
  return courses.map((c) => ({ slug: c.id }))
}

export async function getLessonParams() {
  const { courses } = await getCatalog()
  return courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => ({ curso: c.id, aula: l.id }))))
}
