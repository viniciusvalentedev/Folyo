import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { bunnyEmbedUrl } from '@/lib/bunny'
import { getCatalog } from '@/lib/data/catalog'
import { hasCourseAccess } from '@/lib/data/shop'
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
  const lesson = course ? lessonsOf(course).find((l) => l.id === aula) : undefined
  if (!course || !lesson) notFound()
  // Curso pago sem liberação (compra, manual ou pré-acesso em dia): vai para a página de compra.
  // O banco já não entrega vídeo nem materiais dele; isto só leva a pessoa ao lugar certo.
  if (course.priceCents && !(await hasCourseAccess(course.id))) redirect('/comprar/' + course.id)
  // Vídeo hospedado: o endereço do player leva um token que o servidor gera agora, depois de o
  // banco já ter mostrado esta aula para esta pessoa (a lista do catálogo respeita o papel dela).
  const embedUrl = lesson.video?.kind === 'bunny' ? bunnyEmbedUrl(lesson.video.id) : null
  return <ClassroomView courseId={curso} lessonId={aula} embedUrl={embedUrl} />
}
