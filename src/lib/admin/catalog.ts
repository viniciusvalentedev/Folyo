/**
 * Cadastro de cursos do painel: formato dos dados, regras e ajudantes.
 *
 * Este arquivo roda no navegador (formulários) e no servidor (Server Actions). As
 * MESMAS regras valem nos dois lugares e o banco ainda confere de novo
 * (supabase/migrations/20261024000001_folyo2_catalogo.sql). Se mudar um limite aqui,
 * mude lá também.
 */

import type { CourseImages } from '@/lib/media'
import type { Level, Plan, Tone } from '@/lib/types'

export const LEVELS: readonly Level[] = ['Iniciante', 'Intermediário', 'Avançado']
export const LANGUAGES = ['Português', 'Inglês', 'Espanhol'] as const
export const TONES: readonly Tone[] = ['blue', 'magenta', 'ink', 'lime', 'paper']
export const TONE_LABELS: Record<Tone, string> = {
  blue: 'Azul',
  magenta: 'Magenta',
  ink: 'Preto',
  lime: 'Lima',
  paper: 'Claro',
}

/** Skills sugeridas no cadastro (além das que os cursos já usam). */
export const DEFAULT_SKILLS = ['Marketing', 'Vendas', 'Comunicação', 'Tecnologia', 'Gestão', 'Design', 'Idiomas', 'Carreira']

/** Ícones que uma categoria pode usar (todos existem em src/components/ui/Icon.tsx). */
export const CATEGORY_ICONS = [
  'Megaphone',
  'Handshake',
  'Code',
  'Building2',
  'Languages',
  'Rocket',
  'ClipboardList',
  'Wallet',
  'Users',
  'GraduationCap',
  'Headphones',
  'BrainCircuit',
  'Clapperboard',
  'Briefcase',
  'Palette',
  'ChartColumn',
  'Lightbulb',
  'BookOpen',
  'Globe',
  'Store',
  'Target',
  'Layers',
] as const

export type CourseStatus = 'rascunho' | 'agendado' | 'publicado' | 'arquivado'
export const COURSE_STATUSES: readonly CourseStatus[] = ['rascunho', 'agendado', 'publicado', 'arquivado']

export const STATUS_INFO: Record<CourseStatus, { label: string; tone: 'muted' | 'info' | 'ok' | 'warn'; icon: string }> = {
  rascunho: { label: 'Rascunho', tone: 'muted', icon: 'Pencil' },
  agendado: { label: 'Agendado', tone: 'info', icon: 'Calendar' },
  publicado: { label: 'Publicado', tone: 'ok', icon: 'CircleCheck' },
  arquivado: { label: 'Despublicado', tone: 'warn', icon: 'EyeOff' },
}

/** Limites (iguais aos do banco). */
export const CATALOG_LIMITS = {
  /** Preço em centavos (R$ 0,01 a R$ 100.000,00); o banco confere o mesmo. */
  priceCents: { min: 1, max: 10_000_000 },
  title: { min: 4, max: 90 },
  subtitle: 120,
  summary: { min: 20, max: 220 },
  description: { min: 40, max: 4000 },
  instructor: 80,
  audience: 300,
  hours: { min: 1, max: 500 },
  tags: { items: 12, length: 30 },
  outcomes: { items: 12, length: 160 },
  skills: { items: 15, length: 40 },
  glyph: 3,
  related: 10,
  projectTitle: 120,
  projectText: 600,
  projectSteps: { items: 8, length: 120 },
  certNote: 160,
  moduleTitle: 90,
  moduleDesc: 300,
  modules: 60,
  lessonTitle: { min: 3, max: 120 },
  lessonDesc: 2000,
  lessonMin: { min: 1, max: 300 },
  lessonsPerModule: 200,
  lessonsPerCourse: 400,
  materials: 20,
  materialLabel: 90,
  url: 500,
  categoryName: { min: 3, max: 60 },
  categoryDesc: 200,
} as const

/** Material da aula: um link (`url`) OU um PDF da biblioteca de mídia (`media`). */
export type AdminMaterial = { id: string; label: string; url: string; media: string | null }

/** Vídeo da aula: link https ou vídeo hospedado no Bunny Stream (id = GUID do vídeo). */
export type AdminVideo = { kind: 'link'; url: string } | { kind: 'bunny'; id: string }
export type AdminLesson = {
  id: string
  title: string
  desc: string
  min: number
  published: boolean
  /** null = sem vídeo. */
  video: AdminVideo | null
  materials: AdminMaterial[]
}
export type AdminModule = { id: string; title: string; desc: string; archived: boolean; lessons: AdminLesson[] }

export type AdminCourse = {
  id: string
  title: string
  subtitle: string
  summary: string
  description: string
  cat: string
  instructor: string
  level: Level
  language: string
  tags: string[]
  hours: number
  outcomes: string[]
  audience: string
  skills: string[]
  tone: Tone
  glyph: string
  order: number
  featured: boolean
  recommended: boolean
  /** true = publicado, mas fora do catálogo (só abre por link). */
  hidden: boolean
  prerequisites: string[]
  related: string[]
  status: CourseStatus
  publishAt: string | null
  plan: Plan
  access: 'todos' | 'assinantes'
  /** Preço em centavos (null = gratuito). Curso com preço só abre para quem tem acesso liberado. */
  priceCents: number | null
  /** "Liberar com cupom de lançamento?" (LANCAMENTO). */
  promo: boolean
  project: { title: string; brief: string; expected: string; steps: string[] }
  certificate: { enabled: boolean; hours: number | null; note: string }
  /** Capa, miniatura e banner (arquivos da biblioteca de mídia). */
  images: CourseImages
  modules: AdminModule[]
  createdAt: string | null
  /** Instante da última gravação, exatamente como o banco devolveu (volta junto ao salvar). */
  updatedAt: string | null
}

export type AdminCategory = {
  id: string
  name: string
  desc: string
  icon: string
  order: number
  active: boolean
  /** Imagem da categoria (arquivo da biblioteca de mídia). */
  media: string | null
}

export type AdminCatalog = { categories: AdminCategory[]; courses: AdminCourse[]; tags: string[] }

export function blankCourse(order = 0): AdminCourse {
  return {
    id: '',
    title: '',
    subtitle: '',
    summary: '',
    description: '',
    cat: '',
    instructor: '',
    level: 'Iniciante',
    language: 'Português',
    tags: [],
    hours: 1,
    outcomes: [],
    audience: '',
    skills: [],
    tone: 'blue',
    glyph: '',
    order,
    featured: false,
    recommended: false,
    hidden: false,
    prerequisites: [],
    related: [],
    status: 'rascunho',
    publishAt: null,
    plan: 'free',
    access: 'todos',
    priceCents: null,
    promo: false,
    project: { title: '', brief: '', expected: '', steps: [] },
    certificate: { enabled: true, hours: null, note: '' },
    images: {},
    modules: [],
    createdAt: null,
    updatedAt: null,
  }
}

/** Endereço (id) a partir do título: sem acento, minúsculo, com hífens. */
export function slugify(text: string, fallback = 'curso') {
  return (
    (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 34)
      .replace(/-+$/g, '') || fallback
  )
}

/** Id curto e único para módulos, aulas e materiais (letras minúsculas, números e hífen). */
export function newId(prefix: string) {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  return prefix + '-' + [...bytes].map((b) => (b % 36).toString(36)).join('')
}

export const ID_PATTERN = /^[a-z0-9-]{1,40}$/

/** Link https com ponto no endereço. */
export const isHttpsUrl = (value: string) => /^https:\/\/[^\s]+\.[^\s]+$/i.test(value.trim()) && value.trim().length <= 500

/** YouTube e Vimeo não deixam tocar em outro site: abrem no site deles. */
export const isExternalVideo = (url: string) => /youtu\.?be|vimeo\.com/i.test(url)

/** A aula tem vídeo de verdade (link preenchido ou vídeo do Bunny escolhido)? */
export const hasVideo = (video: AdminVideo | null | undefined) =>
  !!video && (video.kind === 'bunny' ? video.id.length > 0 : video.url.trim().length > 0)

export type CourseErrors = Partial<Record<'title' | 'summary' | 'cat' | 'hours' | 'certHours' | 'publishAt', string>>

/** Erros que impedem de salvar (campos obrigatórios do cadastro). */
export function validateCourse(course: AdminCourse, others: { id: string; title: string }[], now = Date.now()): CourseErrors {
  const errors: CourseErrors = {}
  const title = course.title.trim()
  if (title.length < CATALOG_LIMITS.title.min) errors.title = 'Dê um título com pelo menos 4 caracteres.'
  else if (others.some((o) => o.id !== course.id && o.title.trim().toLowerCase() === title.toLowerCase())) {
    errors.title = 'Já existe um curso com esse título.'
  }
  if (course.summary.trim().length < CATALOG_LIMITS.summary.min) {
    errors.summary = 'Escreva uma descrição curta com pelo menos 20 caracteres.'
  }
  if (!course.cat) errors.cat = 'Escolha uma categoria.'
  if (!(course.hours >= 1 && course.hours <= 500) || !Number.isInteger(course.hours)) {
    errors.hours = 'Informe a duração estimada em horas (entre 1 e 500).'
  }
  const certHours = course.certificate.hours
  if (certHours != null && !(Number.isInteger(certHours) && certHours >= 1 && certHours <= 500)) {
    errors.certHours = 'Informe a carga horária entre 1 e 500 horas, ou deixe vazio.'
  }
  if (course.status === 'agendado' && (!course.publishAt || new Date(course.publishAt).getTime() <= now)) {
    errors.publishAt = 'Escolha uma data e hora no futuro.'
  }
  return errors
}

/**
 * O que falta para publicar. `quick` confere só o conteúdo (usado quando o curso já está
 * publicado e continua com o mesmo status); sem `quick`, confere também título, descrições e skills.
 */
export function publishProblems(course: AdminCourse, quick = false, opts: { requireCover?: boolean } = {}): string[] {
  const out: string[] = []
  const lessons = course.modules.filter((m) => !m.archived).flatMap((m) => m.lessons.filter((l) => l.published))
  if (!lessons.length) out.push('O curso precisa de pelo menos uma aula publicada.')
  const noVideo = lessons.filter((l) => !hasVideo(l.video))
  if (noVideo.length === 1) out.push(`A aula "${noVideo[0].title || 'sem título'}" ainda não tem vídeo.`)
  else if (noVideo.length > 1) out.push(`${noVideo.length} aulas publicadas ainda não têm vídeo.`)
  if (!quick) {
    if (course.title.trim().length < CATALOG_LIMITS.title.min) out.push('Dê um título ao curso.')
    if (course.summary.trim().length < CATALOG_LIMITS.summary.min) out.push('Escreva a descrição curta.')
    if (course.description.trim().length < CATALOG_LIMITS.description.min) {
      out.push('Escreva a descrição completa (pelo menos 40 caracteres).')
    }
    if (!course.skills.some((s) => s.trim())) out.push('Informe pelo menos uma skill desenvolvida.')
  }
  if (opts.requireCover && !course.images.cover) out.push('Escolha uma capa para o curso.')
  return out
}

/** Contagens do conteúdo (módulos arquivados não contam). */
export function courseCounts(course: Pick<AdminCourse, 'modules'>) {
  const modules = course.modules.filter((m) => !m.archived)
  const lessons = modules.flatMap((m) => m.lessons)
  return {
    modules: modules.length,
    lessons: lessons.length,
    published: lessons.filter((l) => l.published).length,
    minutes: lessons.reduce((sum, l) => sum + (Number(l.min) || 0), 0),
  }
}

/** Texto de "Publicado", "Agendado para 12/11 às 10:00"... */
export function statusText(status: CourseStatus, publishAt: string | null) {
  if (status === 'agendado' && publishAt) {
    const when = new Date(publishAt)
    if (!Number.isNaN(when.getTime())) {
      return `Agendado para ${when.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      })}`
    }
  }
  return STATUS_INFO[status].label
}

/** Compara o conteúdo de dois cursos ignorando id e data (para saber se há o que salvar). */
export function courseSignature(course: AdminCourse) {
  const { id: _id, updatedAt: _updatedAt, createdAt: _createdAt, ...rest } = course
  void _id
  void _updatedAt
  void _createdAt
  return JSON.stringify(rest)
}

/** Duplica um curso: novos ids em tudo, rascunho, sem destaque. */
export function duplicateCourse(course: AdminCourse, id: string): AdminCourse {
  return {
    ...structuredClone(course),
    id,
    title: course.title + ' (cópia)',
    status: 'rascunho',
    publishAt: null,
    featured: false,
    createdAt: null,
    updatedAt: null,
    modules: course.modules.map((m) => ({
      ...structuredClone(m),
      id: newId('m'),
      lessons: m.lessons.map((l) => ({
        ...structuredClone(l),
        id: newId('l'),
        materials: l.materials.map((x) => ({ ...x, id: newId('mt') })),
      })),
    })),
  }
}
