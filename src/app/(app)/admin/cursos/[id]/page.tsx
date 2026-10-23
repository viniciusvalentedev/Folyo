import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CourseEditor, EDITOR_TABS, type EditorTab } from '@/components/admin/catalog/CourseEditor'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { DEFAULT_SKILLS, ID_PATTERN } from '@/lib/admin/catalog'
import { rankOf } from '@/lib/admin/roles'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog } from '@/lib/data/catalog'

// O título do curso vem do banco e depende de quem está logado, então a aba usa um título fixo.
export const metadata: Metadata = { title: 'Editar curso' }

export default function EditCoursePage({ params, searchParams }: PageProps<'/admin/cursos/[id]'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <EditCourse params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function EditCourse({ params, searchParams }: PageProps<'/admin/cursos/[id]'>) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  if (!ID_PATTERN.test(id)) notFound()
  const ctx = await allowed('conteudo')
  if (!ctx) return <SectionDenied />
  const catalog = await getFullCatalog()
  const course = catalog.courses.find((c) => c.id === id)
  if (!course) notFound()
  const aba = typeof query.aba === 'string' ? query.aba : ''
  const initialTab: EditorTab = (EDITOR_TABS as string[]).includes(aba) ? (aba as EditorTab) : 'informacoes'

  return (
    // A chave muda quando o curso muda no banco ("Carregar a versão nova"): o editor recomeça dos dados novos.
    <CourseEditor
      key={course.id + ':' + course.updatedAt}
      isNew={false}
      initial={course}
      initialTab={initialTab}
      canDelete={rankOf(ctx.role) >= 2}
      ctx={{
        categories: catalog.categories,
        others: catalog.courses.filter((c) => c.id !== course.id).map((c) => ({ id: c.id, title: c.title })),
        tags: [...new Set([...catalog.tags, ...catalog.courses.flatMap((c) => c.tags)])],
        skills: [...new Set([...DEFAULT_SKILLS, ...catalog.courses.flatMap((c) => c.skills)])],
      }}
    />
  )
}
