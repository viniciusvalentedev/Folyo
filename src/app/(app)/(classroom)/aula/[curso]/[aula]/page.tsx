import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { bunnyEmbedUrl } from '@/lib/bunny'
import { getCatalog } from '@/lib/data/catalog'
import { hasCourseAccess } from '@/lib/data/shop'
import { getAccount, getCompletedLessonIds } from '@/lib/data/user'
import { lessonsOf } from '@/lib/domain/catalog'
import { blockingIndex, followsSequence } from '@/lib/domain/sequence'
import { isValidSlug } from '@/lib/validation'
import { ClassroomView } from './ClassroomView'

export const metadata: Metadata = { title: 'Aula' }

export default async function AulaPage({ params }: PageProps<'/aula/[curso]/[aula]'>) {
  const { curso, aula } = await params
  // A aula precisa existir E pertencer a este curso; senão, 404.
  if (!isValidSlug(curso) || !isValidSlug(aula)) notFound()
  const { courses } = await getCatalog()
  const course = courses.find((c) => c.id === curso)
  const lessons = course ? lessonsOf(course) : []
  const lesson = lessons.find((l) => l.id === aula)
  if (!course || !lesson) notFound()
  // Curso pago sem liberação (compra, manual ou pré-acesso em dia): vai para a página de compra.
  // O banco já não entrega vídeo nem materiais dele; isto só leva a pessoa ao lugar certo.
  if (course.priceCents && !(await hasCourseAccess(course.id))) redirect('/comprar/' + course.id)
  // Aulas em sequência: o aluno só abre esta aula se todas as anteriores estiverem concluídas; senão volta
  // para a primeira que falta. Conferido aqui, no servidor, ANTES de gerar o endereço do vídeo.
  if (followsSequence((await getAccount()).role)) {
    const done = await getCompletedLessonIds(course.id)
    const blocking = blockingIndex(lessons, lessons.indexOf(lesson), (id) => done.has(id))
    if (blocking >= 0) redirect(`/aula/${course.id}/${lessons[blocking].id}`)
  }
  // Vídeo hospedado: o endereço do player leva um token que o servidor gera agora, depois de o
  // banco já ter mostrado esta aula para esta pessoa (a lista do catálogo respeita o papel dela).
  const embedUrl = lesson.video?.kind === 'bunny' ? bunnyEmbedUrl(lesson.video.id) : null
  return <ClassroomView courseId={curso} lessonId={aula} embedUrl={embedUrl} />
}
