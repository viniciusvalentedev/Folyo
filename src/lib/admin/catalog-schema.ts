import { z } from 'zod'
import { ALT_MAX } from '@/lib/media'
import { CATALOG_LIMITS as L, CATEGORY_ICONS, COURSE_STATUSES, ID_PATTERN, LEVELS, TONES } from './catalog'

/**
 * Conferência (zod) dos dados do cadastro que chegam nas Server Actions.
 * Os mesmos limites existem no banco (20261024000001_folyo2_catalogo.sql); aqui é a 1ª barreira.
 */

const id = z.string().regex(ID_PATTERN)
const str = (max: number) => z.string().max(max)
const strs = (items: number, length: number) => z.array(z.string().max(length)).max(items)
const url = z
  .string()
  .max(L.url)
  .regex(/^https:\/\/[^\s]+\.[^\s]+$/i)

const uuid = z.uuid()

/** Material: um link https OU um PDF da biblioteca (nunca os dois). */
const material = z
  .object({ id, label: str(L.materialLabel), url: z.string().max(L.url), media: uuid.nullable() })
  .refine((m) => (m.media ? m.url === '' : /^https:\/\/[^\s]+\.[^\s]+$/i.test(m.url)), 'Informe um link https ou um arquivo.')

const video = z.union([
  z.object({ kind: z.literal('link'), url }),
  z.object({ kind: z.literal('bunny'), id: uuid }),
])

const imageRef = z.object({
  media: uuid,
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  alt: str(ALT_MAX),
})

const lesson = z.object({
  id,
  title: str(L.lessonTitle.max),
  desc: str(L.lessonDesc),
  min: z.number().int().min(L.lessonMin.min).max(L.lessonMin.max),
  published: z.boolean(),
  video: video.nullable(),
  materials: z.array(material).max(L.materials),
})

const module_ = z.object({
  id,
  title: str(L.moduleTitle),
  desc: str(L.moduleDesc),
  archived: z.boolean(),
  lessons: z.array(lesson).max(L.lessonsPerModule),
})

export const courseSchema = z.object({
  id,
  title: str(L.title.max),
  subtitle: str(L.subtitle),
  summary: str(L.summary.max),
  description: str(L.description.max),
  cat: id,
  instructor: str(L.instructor),
  level: z.enum(LEVELS as [string, ...string[]]),
  language: str(30),
  tags: strs(L.tags.items, L.tags.length),
  hours: z.number().int().min(L.hours.min).max(L.hours.max),
  outcomes: strs(L.outcomes.items, L.outcomes.length),
  audience: str(L.audience),
  skills: strs(L.skills.items, L.skills.length),
  tone: z.enum(TONES as [string, ...string[]]),
  glyph: str(L.glyph),
  order: z.number().int().min(0).max(100000),
  featured: z.boolean(),
  recommended: z.boolean(),
  hidden: z.boolean(),
  prerequisites: strs(L.related, 40),
  related: strs(L.related, 40),
  status: z.enum(COURSE_STATUSES as [string, ...string[]]),
  publishAt: z.string().max(40).nullable(),
  plan: z.enum(['free', 'pro']),
  access: z.enum(['todos', 'assinantes']),
  project: z.object({
    title: str(L.projectTitle),
    brief: str(L.projectText),
    expected: str(L.projectText),
    steps: strs(L.projectSteps.items, L.projectSteps.length),
  }),
  certificate: z.object({
    enabled: z.boolean(),
    hours: z.number().int().min(1).max(500).nullable(),
    note: str(L.certNote),
  }),
  images: z.object({ cover: imageRef.nullish(), thumb: imageRef.nullish(), banner: imageRef.nullish() }),
  modules: z.array(module_).max(L.modules),
})

export const categorySchema = z.object({
  id,
  name: str(L.categoryName.max),
  desc: str(L.categoryDesc),
  icon: z.enum(CATEGORY_ICONS),
  active: z.boolean(),
  media: uuid.nullable(),
})
