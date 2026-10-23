import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog } from '@/lib/data/catalog'
import { isValidSlug } from '@/lib/validation'
import { CourseView } from './CourseView'

// O título do curso vem do banco e depende de quem está logado, então a aba usa um título fixo.
export const metadata: Metadata = { title: 'Curso' }

export default async function CursoPage({ params }: PageProps<'/cursos/[slug]'>) {
  const { slug } = await params
  const { courses } = await getCatalog()
  // Validação no servidor: id com formato estranho ou curso inexistente vira 404.
  if (!isValidSlug(slug) || !courses.some((c) => c.id === slug)) notFound()
  return <CourseView id={slug} />
}
