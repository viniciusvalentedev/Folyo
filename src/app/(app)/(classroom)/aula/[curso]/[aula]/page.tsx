import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog } from '@/lib/data/catalog'
import { lessonsOf } from '@/lib/domain/catalog'
import { isValidSlug } from '@/lib/validation'
import { ClassroomView } from './ClassroomView'

export const metadata: Metadata = { title: 'Aula' }

export default async function AulaPage({ params }: PageProps<'/aula/[curso]/[aula]'>) {
  const { curso, aula } = await params
  // A aula precisa existir E pertencer a este curso; senão, 404.
  if (!isValidSlug(curso) || !isValidSlug(aula)) notFound()
  const { courses } = await getCatalog()
  const course = courses.find((c) => c.id === curso)
  if (!course || !lessonsOf(course).some((l) => l.id === aula)) notFound()
  return <ClassroomView courseId={curso} lessonId={aula} />
}
