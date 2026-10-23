import type { Catalog, Category, Course, LessonRef } from '@/lib/types'

/** Todas as aulas de um curso, na ordem, com a posição no módulo. */
export function lessonsOf(course: Course): LessonRef[] {
  return course.modules.flatMap((m, mi) => m.lessons.map((l, li) => ({ ...l, mi, li, module: m.title })))
}

export function findCourse(catalog: Catalog, id: string): Course | undefined {
  return catalog.courses.find((c) => c.id === id)
}

/** Acha uma aula em qualquer curso e devolve o contexto dela. */
export function findLesson(catalog: Catalog, lessonId: string) {
  for (const course of catalog.courses) {
    const lessons = lessonsOf(course)
    const index = lessons.findIndex((l) => l.id === lessonId)
    if (index >= 0) return { course, lesson: lessons[index], index, lessons }
  }
  return null
}

export function categoryOf(catalog: Catalog, id: string): Category {
  return catalog.categories.find((c) => c.id === id) ?? { id, name: 'Sem categoria', icon: 'Layers' }
}

/** Texto em minúsculas e sem acentos, para buscas. */
export function normalize(s: string | null | undefined) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function sameText(a: string, b: string) {
  return normalize(a) === normalize(b)
}

/** Posição do curso no catálogo (usada para variar a arte da capa). */
export function courseSeed(catalog: Catalog, courseId: string) {
  return Math.max(0, catalog.courses.findIndex((c) => c.id === courseId))
}
