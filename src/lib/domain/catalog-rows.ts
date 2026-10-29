import { z } from 'zod'
import type { IconName } from '@/components/ui/Icon'
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
import { clampPct, imageUrl, materialUrl, type CourseImages, type ImageSlot, type MediaItem, type StudentImages } from '@/lib/media'
import { DEFAULT_TRAILS, TRAIL_ID_PATTERN, type Trail } from '@/lib/trails'
import type { Catalog, Category, Course, Lesson, LessonMaterial, Module } from '@/lib/types'

/**
 * Do banco para a tela: catálogo de cursos.
 *
 * "Leitura desconfiada": cada linha é conferida de novo (zod) e o que estiver fora do
 * formato é descartado. E a regra de quem enxerga o quê é aplicada AQUI também, não só no
 * banco: uma pessoa da equipe consegue ler rascunhos pela API, mas no site do aluno ela vê
 * o mesmo que os alunos veem.
 */

// ---------- Colunas lidas (nunca "select *") ----------

/** Trilhas (SQL das trilhas). Lidas à parte: sem esse SQL, valem as 7 trilhas de sempre. */
export const TRAIL_COLUMNS = 'id, title, blurb, icon, skills, keywords, course_ids, position, active'
export const CATEGORY_COLUMNS = 'id, name, description, icon, position, active, media_id'
export const COURSE_COLUMNS = [
  'id, title, subtitle, summary, description, category_id, instructor, level, language, tags, hours',
  'outcomes, audience, skills, tone, glyph, position, featured, recommended, hidden, prerequisites, related',
  'status, publish_at, plan, access, project_title, project_brief, project_expected, project_steps',
  'cert_enabled, cert_hours, cert_note, images, created_at, updated_at',
].join(', ')
/** Preço e cupom (SQL do cupom de lançamento). Lidos à parte: sem esse SQL, todo curso vale como gratuito. */
export const COURSE_SALE_COLUMNS = 'id, price_cents, promo_launch_eligible'
export const MODULE_COLUMNS = 'id, course_id, title, description, archived, position'
/** Sem o vídeo: ele vem de lesson_videos(), que só entrega o dos cursos que a pessoa pode assistir. */
export const LESSON_COLUMNS = 'id, module_id, course_id, title, description, minutes, published, position'
/** Leitura direta do vídeo (só funciona antes do SQL do cupom de lançamento, que fecha essas colunas). */
export const LESSON_VIDEO_COLUMNS = 'id, video_kind, video_url, bunny_video_id'
export const MATERIAL_COLUMNS = 'id, lesson_id, label, url, media_id, position'
export const MEDIA_COLUMNS = 'id, kind, name, alt, path, mime, size, width, height, created_at, updated_at'

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
  media_id: z.uuid().nullable(),
})

const imageRefRow = z.object({
  media: z.uuid(),
  x: z.number().min(0).max(100).catch(50),
  y: z.number().min(0).max(100).catch(50),
  alt: z.string().max(160).catch(''),
})
// Imagem estragada não derruba o curso: vira "sem imagem".
const imagesRow = z
  .object({ cover: imageRefRow.optional().catch(undefined), thumb: imageRefRow.optional().catch(undefined), banner: imageRefRow.optional().catch(undefined) })
  .catch({})

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
  // Ausentes antes do SQL do cupom de lançamento: curso gratuito e fora da promoção.
  price_cents: z.number().int().min(0).max(10_000_000).nullable().catch(null),
  promo_launch_eligible: z.boolean().catch(false),
  project_title: text(120),
  project_brief: text(600),
  project_expected: text(600),
  project_steps: list(8, 120),
  cert_enabled: z.boolean(),
  cert_hours: z.number().int().min(1).max(500).nullable(),
  cert_note: text(160),
  images: imagesRow,
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
  // Sem vídeo, ou vídeo que esta pessoa não pode assistir (curso pago sem acesso): null.
  video_kind: z.enum(['link', 'bunny']).nullable().catch(null),
  video_url: httpsUrl.nullable().catch(null),
  bunny_video_id: z.uuid().nullable().catch(null),
  position: z.number().int(),
})

const materialRow = z.object({
  id,
  lesson_id: id,
  label: text(90),
  url: httpsUrl.nullable(),
  media_id: z.uuid().nullable(),
  position: z.number().int(),
})

const mediaRow = z.object({
  id: z.uuid(),
  kind: z.enum(['image', 'file']),
  name: text(120),
  alt: text(160),
  path: text(120),
  mime: text(60),
  size: z.number().int().nonnegative(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export function mediaFromRows(rows: unknown[]): MediaItem[] {
  return valid(rows, mediaRow).map((m) => ({
    id: m.id,
    kind: m.kind,
    name: m.name,
    alt: m.alt,
    path: m.path,
    mime: m.mime,
    size: m.size,
    width: m.width,
    height: m.height,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }))
}

export type CatalogRows = {
  categories: unknown[]
  courses: unknown[]
  modules: unknown[]
  lessons: unknown[]
  materials: unknown[]
  media?: unknown[]
  /** Ausente = o banco ainda não tem a tabela de trilhas (valem as de sempre). */
  trails?: unknown[]
}

const trailRow = z.object({
  id: z.string().regex(TRAIL_ID_PATTERN),
  title: z.string().min(1).max(80),
  blurb: z.string().max(200),
  icon: z.string().max(40),
  skills: z.array(z.string().max(40)).max(10),
  keywords: z.array(z.string().max(40)).max(10),
  course_ids: z.array(z.string().max(40)).max(12),
  position: z.number(),
  active: z.boolean(),
})

/** Trilhas na ordem do painel. Sem a tabela (SQL ainda não rodou), as 7 trilhas de sempre. */
export function trailsFromRows(rows: unknown[] | undefined): Trail[] {
  if (!rows) return DEFAULT_TRAILS
  return valid(rows, trailRow)
    .sort(byPosition)
    .map((t) => ({
      id: t.id,
      title: t.title,
      blurb: t.blurb,
      icon: ((CATEGORY_ICONS as readonly string[]).includes(t.icon) ? t.icon : 'Rocket') as IconName,
      skills: t.skills,
      keywords: t.keywords,
      courseIds: t.course_ids,
      active: t.active,
    }))
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
    .map((c) => ({ id: c.id, name: c.name, desc: c.description, icon: iconOrDefault(c.icon), order: c.position, active: c.active, media: c.media_id }))

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
      priceCents: c.price_cents && c.price_cents > 0 ? c.price_cents : null,
      promo: c.promo_launch_eligible,
      project: { title: c.project_title, brief: c.project_brief, expected: c.project_expected, steps: c.project_steps },
      certificate: { enabled: c.cert_enabled, hours: c.cert_hours, note: c.cert_note },
      images: Object.fromEntries(
        Object.entries(c.images).filter(([, ref]) => !!ref).map(([slot, ref]) => [slot, { media: ref!.media, x: ref!.x, y: ref!.y, alt: ref!.alt }]),
      ) as CourseImages,
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
            video:
              l.video_kind === 'bunny' && l.bunny_video_id
                ? { kind: 'bunny', id: l.bunny_video_id }
                : l.video_url
                  ? { kind: 'link', url: l.video_url }
                  : null,
            materials: (materialsByLesson.get(l.id) ?? [])
              .sort(byPosition)
              .map((x) => ({ id: x.id, label: x.label, url: x.url ?? '', media: x.media_id })),
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
export function studentCatalog(admin: AdminCatalog, now = Date.now(), mediaList: MediaItem[] = [], trails: Trail[] = DEFAULT_TRAILS): Catalog {
  const media = new Map(mediaList.map((m) => [m.id, m]))
  const categories: Category[] = admin.categories.map((c) => {
    const file = c.media ? media.get(c.media) : undefined
    return { id: c.id, name: c.name, icon: c.icon, active: c.active, ...(file?.kind === 'image' ? { image: imageUrl(file.path) } : {}) }
  })
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
              video: l.video && (l.video.kind === 'bunny' || l.video.url) ? l.video : null,
              materials: l.materials.flatMap((x): LessonMaterial[] => {
                if (!x.media) return x.url ? [{ id: x.id, label: x.label, url: x.url }] : []
                const file = media.get(x.media)
                return file?.kind === 'file' ? [{ id: x.id, label: x.label, url: materialUrl(x.id), file: { name: file.name, size: file.size } }] : []
              }),
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
      ...(c.priceCents ? { priceCents: c.priceCents, promo: c.promo } : {}),
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
      images: studentImages(c.images, media),
    })
  }
  return { courses, categories, trails }
}

/** Capa, miniatura e banner prontos para a tela (só arquivos que ainda existem e são imagens). */
function studentImages(images: CourseImages, media: Map<string, MediaItem>): StudentImages | undefined {
  const out: StudentImages = {}
  for (const slot of ['cover', 'thumb', 'banner'] as ImageSlot[]) {
    const ref = images[slot]
    const file = ref ? media.get(ref.media) : undefined
    if (ref && file?.kind === 'image') {
      out[slot] = { url: imageUrl(file.path), x: clampPct(ref.x), y: clampPct(ref.y), alt: ref.alt || file.alt }
    }
  }
  return Object.keys(out).length ? out : undefined
}
