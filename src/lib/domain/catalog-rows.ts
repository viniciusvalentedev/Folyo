import { z } from 'zod'
import {
  CATEGORY_ICONS,
  COURSE_STATUSES,
  ID_PATTERN,
  LEVELS,
  TONES,
  type AdminCatalog,
  type AdminCategory,
  type AdminCourse,
  type AdminModule,
} from '@/lib/admin/catalog'
import type { Catalog, Category, Course, Lesson, Module } from '@/lib/types'

/**
 * Do banco para a tela: catálogo de cursos.
 *
 * "Leitura desconfiada": cada linha é conferida de novo (zod) e o que estiver fora do
 * formato é descartado. E a regra de quem enxerga o quê é aplicada AQUI também, não só no
 * banco: uma pessoa da equipe consegue ler rascunhos pela API, mas no site do aluno ela vê
 * o mesmo que os alunos veem.
 */

// ---------- Colunas lidas (nunca "select *") ----------

export const CATEGORY_COLUMNS = 'id, name, description, icon, position, active'
export const COURSE_COLUMNS = [
  'id, title, subtitle, summary, description, category_id, instructor, level, language, tags, hours',
  'outcomes, audience, skills, tone, glyph, position, featured, recommended, hidden, prerequisites, related',
  'status, publish_at, plan, access, project_title, project_brief, project_expected, project_steps',
  'cert_enabled, cert_hours, cert_note, created_at, updated_at',
].join(', ')
export const MODULE_COLUMNS = 'id, course_id, title, description, archived, position'
export const LESSON_COLUMNS = 'id, module_id, course_id, title, description, minutes, published, video_url, position'
export const MATERIAL_COLUMNS = 'id, lesson_id, label, url, position'

// ---------- Linhas ----------

const id = z.string().regex(ID_PATTERN)
const text = (max: number) => z.string().max(max)
const list = (max: number, length: number) => z.array(z.string().max(length)).max(max)

const categoryRow = z.object({
  id,
  name: text(60),
  description: text(200),
  icon: text(40),
  position: z.number().int(),
  active: z.boolean(),
})

const courseRow = z.object({
  id,
  title: text(90),
  subtitle: text(120),
  summary: text(220),
  description: text(4000),
  category_id: id,
  instructor: text(80),
  level: z.enum(LEVELS as [string, ...string[]]),
  language: text(30),
  tags: list(12, 30),
  hours: z.number().int().min(1).max(500),
  outcomes: list(12, 160),
  audience: text(300),
  skills: list(15, 40),
  tone: z.enum(TONES as [string, ...string[]]),
  glyph: text(3),
  position: z.number().int(),
  featured: z.boolean(),
  recommended: z.boolean(),
  hidden: z.boolean(),
  prerequisites: list(10, 40),
  related: list(10, 40),
  status: z.enum(COURSE_STATUSES as [string, ...string[]]),
  publish_at: z.string().nullable(),
  plan: z.enum(['free', 'pro']),
  access: z.enum(['todos', 'assinantes']),
  project_title: text(120),
  project_brief: text(600),
  project_expected: text(600),
  project_steps: list(8, 120),
  cert_enabled: z.boolean(),
  cert_hours: z.number().int().min(1).max(500).nullable(),
  cert_note: text(160),
  created_at: z.string(),
  updated_at: z.string(),
})

const moduleRow = z.object({
  id,
  course_id: id,
  title: text(90),
  description: text(300),
  archived: z.boolean(),
  position: z.number().int(),
})

const httpsUrl = z.string().max(500).regex(/^https:\/\/\S+\.\S+$/i)

const lessonRow = z.object({
  id,
  module_id: id,
  course_id: id,
  title: text(120),
  description: text(2000),
  minutes: z.number().int().min(1).max(300),
  published: z.boolean(),
  video_url: httpsUrl.nullable(),
  position: z.number().int(),
})

const materialRow = z.object({ id, lesson_id: id, label: text(90), url: httpsUrl, position: z.number().int() })

export type CatalogRows = {
  categories: unknown[]
  courses: unknown[]
  modules: unknown[]
  lessons: unknown[]
  materials: unknown[]
}

function valid<T>(rows: unknown[], schema: z.ZodType<T>): T[] {
  const out: T[] = []
  for (const row of rows) {
    const parsed = schema.safeParse(row)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position
const collator = new Intl.Collator('pt-BR')

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const bucket = map.get(k)
    if (bucket) bucket.push(item)
    else map.set(k, [item])
  }
  return map
}

const iconOrDefault = (name: string) => ((CATEGORY_ICONS as readonly string[]).includes(name) ? name : 'Layers')

// ---------- Painel: tudo, como está no banco ----------

export function adminCatalogFromRows(rows: CatalogRows, tags: string[] = []): AdminCatalog {
  const categories: AdminCategory[] = valid(rows.categories, categoryRow)
    .sort(byPosition)
    .map((c) => ({ id: c.id, name: c.name, desc: c.description, icon: iconOrDefault(c.icon), order: c.position, active: c.active }))

  const modules = valid(rows.modules, moduleRow)
  const lessons = valid(rows.lessons, lessonRow)
  const materials = valid(rows.materials, materialRow)
  const modulesByCourse = groupBy(modules, (m) => m.course_id)
  const lessonsByModule = groupBy(lessons, (l) => l.module_id)
  const materialsByLesson = groupBy(materials, (m) => m.lesson_id)

  const courses: AdminCourse[] = valid(rows.courses, courseRow)
    .sort((a, b) => a.position - b.position || collator.compare(a.title, b.title))
    .map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: c.subtitle,
      summary: c.summary,
      description: c.description,
      cat: c.category_id,
      instructor: c.instructor,
      level: c.level as AdminCourse['level'],
      language: c.language,
      tags: c.tags,
      hours: c.hours,
      outcomes: c.outcomes,
      audience: c.audience,
      skills: c.skills,
      tone: c.tone as AdminCourse['tone'],
      glyph: c.glyph,
      order: c.position,
      featured: c.featured,
      recommended: c.recommended,
      hidden: c.hidden,
      prerequisites: c.prerequisites,
      related: c.related,
      status: c.status as AdminCourse['status'],
      publishAt: c.publish_at,
      plan: c.plan,
      access: c.access,
      project: { title: c.project_title, brief: c.project_brief, expected: c.project_expected, steps: c.project_steps },
      certificate: { enabled: c.cert_enabled, hours: c.cert_hours, note: c.cert_note },
      modules: (modulesByCourse.get(c.id) ?? []).sort(byPosition).map(
        (m): AdminModule => ({
          id: m.id,
          title: m.title,
          desc: m.description,
          archived: m.archived,
          lessons: (lessonsByModule.get(m.id) ?? []).sort(byPosition).map((l) => ({
            id: l.id,
            title: l.title,
            desc: l.description,
            min: l.minutes,
            published: l.published,
            video: l.video_url ? { url: l.video_url } : null,
            materials: (materialsByLesson.get(l.id) ?? [])
              .sort(byPosition)
              .map((x) => ({ id: x.id, label: x.label, url: x.url })),
          })),
        }),
      ),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))

  return { categories, courses, tags: [...new Set(tags)].sort(collator.compare) }
}

// ---------- Aluno: só o que os alunos podem ver ----------

/** O curso aparece para os alunos? (publicado, despublicado, ou agendado cuja data já passou) */
export function isLive(course: Pick<AdminCourse, 'status' | 'publishAt'>, now = Date.now()) {
  if (course.status === 'publicado' || course.status === 'arquivado') return true
  return course.status === 'agendado' && !!course.publishAt && new Date(course.publishAt).getTime() <= now
}

/** Vira o catálogo do aluno: sem rascunhos, módulos arquivados, aulas despublicadas e cursos vazios. */
export function studentCatalog(admin: AdminCatalog, now = Date.now()): Catalog {
  const categories: Category[] = admin.categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, active: c.active }))
  const courses: Course[] = []
  for (const c of admin.courses) {
    if (!isLive(c, now)) continue
    const modules: Module[] = c.modules
      .filter((m) => !m.archived)
      .map((m) => ({
        id: m.id,
        title: m.title,
        lessons: m.lessons
          .filter((l) => l.published)
          .map(
            (l): Lesson => ({
              id: l.id,
              title: l.title,
              min: l.min,
              desc: l.desc || undefined,
              video: l.video?.url ?? null,
              materials: l.materials,
            }),
          ),
      }))
      .filter((m) => m.lessons.length > 0)
    if (!modules.length) continue
    courses.push({
      id: c.id,
      title: c.title,
      cat: c.cat,
      level: c.level,
      hours: c.hours,
      tone: c.tone,
      glyph: c.glyph,
      plan: c.plan,
      featured: c.featured,
      recommended: c.recommended,
      hidden: c.hidden,
      summary: c.summary,
      subtitle: c.subtitle || undefined,
      description: c.description || undefined,
      instructor: c.instructor || undefined,
      language: c.language,
      audience: c.audience || undefined,
      prerequisites: c.prerequisites,
      status: c.status === 'arquivado' ? 'arquivado' : 'publicado',
      outcomes: c.outcomes,
      skills: c.skills,
      project: { title: c.project.title, brief: c.project.brief, expected: c.project.expected },
      certificate: {
        enabled: c.certificate.enabled,
        hours: c.certificate.hours ?? undefined,
        note: c.certificate.note || undefined,
      },
      modules,
    })
  }
  return { courses, categories }
}
