import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog, getLessonParams } from '@/lib/data/catalog'
import { lessonsOf } from '@/lib/domain/catalog'
import { isValidSlug } from '@/lib/validation'
import { ClassroomView } from './ClassroomView'

/** Gera no build uma página para cada aula. */
export async function generateStaticParams() {
  return getLessonParams()
}

async function findLesson(curso: string, aula: string) {
  if (!isValidSlug(curso) || !isValidSlug(aula)) return null
  const { courses } = await getCatalog()
  const course = courses.find((c) => c.id === curso)
  const lesson = course ? lessonsOf(course).find((l) => l.id === aula) : undefined
  return course && lesson ? { course, lesson } : null
}

export async function generateMetadata({ params }: PageProps<'/aula/[curso]/[aula]'>): Promise<Metadata> {
  const { curso, aula } = await params
  const found = await findLesson(curso, aula)
  return { title: found ? `${found.lesson.title} · ${found.course.title}` : 'Aula não encontrada' }
}

export default async function AulaPage({ params }: PageProps<'/aula/[curso]/[aula]'>) {
  const { curso, aula } = await params
  // A aula precisa existir E pertencer a este curso; senão, 404.
  if (!(await findLesson(curso, aula))) notFound()
  return <ClassroomView courseId={curso} lessonId={aula} />
}
