import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog, getCourseParams } from '@/lib/data/catalog'
import { isValidSlug } from '@/lib/validation'
import { CourseView } from './CourseView'

/** Gera no build uma página para cada curso do catálogo. */
export async function generateStaticParams() {
  return getCourseParams()
}

export async function generateMetadata({ params }: PageProps<'/cursos/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const { courses } = await getCatalog()
  const course = courses.find((c) => c.id === slug)
  return { title: course?.title ?? 'Curso não encontrado', description: course?.summary }
}

export default async function CursoPage({ params }: PageProps<'/cursos/[slug]'>) {
  const { slug } = await params
  const { courses } = await getCatalog()
  // Validação no servidor: id com formato estranho ou curso inexistente vira 404.
  if (!isValidSlug(slug) || !courses.some((c) => c.id === slug)) notFound()
  return <CourseView id={slug} />
}
