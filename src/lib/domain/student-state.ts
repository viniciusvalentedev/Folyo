import type { z } from 'zod'
import { findCourse, findLesson } from '@/lib/domain/catalog'
import { brDate } from '@/lib/format'
import { STAGE_IDS, TRAIL_IDS, WANT_IDS } from '@/lib/trails'
import type { Catalog, ResumeSection, Skill, UserState, Work } from '@/lib/types'
import {
  achievementSchema,
  educationSchema,
  experienceSchema,
  languageSchema,
  storedSkillSchema,
  storedWorkSchema,
} from '@/lib/validation'

/** Linhas como vêm do banco (só as colunas que o site lê). */
export type ProfileRow = {
  name: string
  stage: string | null
  exploring: boolean
  goal_primary: string | null
  goals_secondary: string[]
  goals_text: string
  goals_skills: string[]
  goals_wants: string[]
  onboarded: boolean
  created_at: string
  updated_at: string
  headline: string
  city: string
  contact_email: string
  phone: string
  link: string
  bio: string
  objective: string
  interests: string[]
  education: unknown
  experiences: unknown
  languages: unknown
  achievements: unknown
  resume_template: string
  resume_order: string[]
  resume_hidden: string[]
  resume_certs: string[]
  public_profile: boolean
  public_portfolio: boolean
  show_email: boolean
  notify_lessons: boolean
  notify_weekly: boolean
  notify_news: boolean
  study_time: string
  captions: boolean
  autoplay: boolean
  reduce_motion: boolean
  notifications_read_at: string | null
}

export type CourseProgressRow = {
  course_id: string
  started: boolean
  started_at: string | null
  last_lesson_id: string | null
  favorite: boolean
}
export type LessonCompletionRow = { course_id: string; lesson_id: string; completed_at: string }
export type LessonNoteRow = { course_id: string; lesson_id: string; body: string }
export type LessonWatchRow = { course_id: string; lesson_id: string; seconds: number }
export type WorkRow = {
  id: string
  course_id: string | null
  kind: string
  title: string
  description: string
  url: string | null
  file_name: string | null
  file_size: number | null
  is_public: boolean
  in_cv: boolean
  created_at: string
  updated_at: string
}
export type SkillRow = { id: string; name: string; type: string; in_cv: boolean; note: string; created_at: string }

export type StudentRows = {
  profile: ProfileRow
  email: string
  role: UserState['role']
  progress: CourseProgressRow[]
  completions: LessonCompletionRow[]
  notes: LessonNoteRow[]
  watch: LessonWatchRow[]
  works: WorkRow[]
  skills: SkillRow[]
}

const RESUME_SECTIONS: ResumeSection[] = [
  'objetivo',
  'formacao',
  'experiencia',
  'projetos',
  'cursos',
  'competencias',
  'idiomas',
  'conquistas',
]

export { brDate }


/** Uma linha de `works` vira um trabalho da tela (ou null se o conteúdo não passar na conferência). */
export function workFromRow(r: WorkRow): Work | null {
  const parsed = storedWorkSchema.safeParse({
    id: r.id,
    courseId: r.course_id,
    kind: r.kind,
    title: r.title,
    desc: r.description,
    url: r.url,
    file: r.kind === 'pdf' && r.file_name && r.file_size ? { name: r.file_name, size: r.file_size } : null,
    public: r.is_public,
    inCV: r.in_cv,
  })
  return parsed.success ? { ...parsed.data, createdAt: r.created_at, updatedAt: r.updated_at } : null
}

/** Colunas lidas de `works` (nunca "select *", e o caminho do arquivo no Storage não sai do servidor). */
export const WORK_COLUMNS =
  'id, course_id, kind, title, description, url, file_name, file_size, is_public, in_cv, created_at, updated_at'

/** Lista de itens: guarda só os itens válidos (o banco pode ter sido escrito direto pela API). */
function validItems<T>(raw: unknown, schema: z.ZodType<T>, max: number): T[] {
  if (!Array.isArray(raw)) return []
  const out: T[] = []
  for (const item of raw.slice(0, max)) {
    const parsed = schema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}

/** Só os ids conhecidos, sem repetir. */
function knownIds(list: string[] | null | undefined, known: string[], max: number) {
  return [...new Set((list ?? []).filter((x) => known.includes(x)))].slice(0, max)
}

/**
 * Monta o estado do aluno a partir das linhas do banco.
 *
 * Tudo é conferido de novo aqui: ids que não existem no catálogo são ignorados e
 * itens com formato estranho são descartados. Assim, nada esquisito gravado direto
 * na API chega à tela (nem quebra a página).
 */
export function stateFromRows(rows: StudentRows, catalog: Catalog): UserState {
  const { profile, email } = rows
  const name = profile.name.trim() || email.split('@')[0]
  const joined = brDate(profile.created_at)

  const completed: UserState['completed'] = {}
  for (const r of rows.completions) {
    const found = findLesson(catalog, r.lesson_id)
    if (found && found.course.id === r.course_id) completed[r.lesson_id] = brDate(r.completed_at)
  }

  const started: UserState['started'] = {}
  const lastLesson: UserState['lastLesson'] = {}
  const favorites: string[] = []
  for (const r of rows.progress) {
    const course = findCourse(catalog, r.course_id)
    if (!course) continue
    if (r.started && r.started_at) started[r.course_id] = brDate(r.started_at)
    if (r.last_lesson_id && findLesson(catalog, r.last_lesson_id)?.course.id === r.course_id) {
      lastLesson[r.course_id] = r.last_lesson_id
    }
    if (r.favorite) favorites.push(r.course_id)
  }

  const notes: UserState['notes'] = {}
  for (const r of rows.notes) {
    if (findLesson(catalog, r.lesson_id)?.course.id === r.course_id) notes[r.lesson_id] = r.body
  }

  const watch: UserState['watch'] = {}
  for (const r of rows.watch) {
    if (findLesson(catalog, r.lesson_id)?.course.id === r.course_id && Number.isFinite(r.seconds) && r.seconds > 0) {
      watch[r.lesson_id] = Math.min(86400, Math.floor(r.seconds))
    }
  }

  const works: Work[] = []
  for (const r of rows.works) {
    const work = workFromRow(r)
    if (!work) continue
    if (work.courseId && !findCourse(catalog, work.courseId)) continue
    works.push(work)
  }

  const skills: Skill[] = []
  for (const r of rows.skills) {
    const parsed = storedSkillSchema.safeParse({ id: r.id, name: r.name, type: r.type, inCV: r.in_cv, note: r.note })
    if (parsed.success) skills.push({ ...parsed.data, createdAt: brDate(r.created_at) })
  }

  const courseIds = new Set(catalog.courses.map((c) => c.id))
  const order = profile.resume_order.filter((x): x is ResumeSection => (RESUME_SECTIONS as string[]).includes(x))
  // Seções que faltam na ordem (ex.: dados antigos) entram no fim, para nada sumir do currículo.
  for (const sec of RESUME_SECTIONS) if (!order.includes(sec)) order.push(sec)

  const welcomeRead = !!profile.notifications_read_at

  const primaryGoal = profile.goal_primary && TRAIL_IDS.includes(profile.goal_primary) ? profile.goal_primary : null
  const secondaryGoals = knownIds(profile.goals_secondary, TRAIL_IDS, 2).filter((g) => g !== primaryGoal)

  return {
    onboarded: profile.onboarded,
    accountEmail: email,
    role: rows.role,
    user: {
      name,
      first: name.split(' ')[0] || name,
      headline: profile.headline,
      stage: profile.stage && STAGE_IDS.includes(profile.stage) ? profile.stage : '',
      exploring: profile.exploring,
      city: profile.city,
      email: profile.contact_email,
      phone: profile.phone,
      link: profile.link,
      bio: profile.bio,
      objective: profile.objective,
      interests: (profile.interests ?? []).slice(0, 15),
      joined,
      education: validItems(profile.education, educationSchema, 20),
      experiences: validItems(profile.experiences, experienceSchema, 20),
      languages: validItems(profile.languages, languageSchema, 15),
      achievements: validItems(profile.achievements, achievementSchema, 30),
    },
    completed,
    lastLesson,
    started,
    favorites,
    notes,
    watch,
    works,
    skills,
    resume: {
      template: oneOf(profile.resume_template, ['classico', 'moderno'] as const, 'classico'),
      order,
      hidden: profile.resume_hidden.filter((x): x is ResumeSection => (RESUME_SECTIONS as string[]).includes(x)),
      certs: profile.resume_certs.filter((id) => courseIds.has(id)),
      savedAt: profile.updated_at,
      dirty: false,
    },
    goals: {
      primary: primaryGoal,
      secondary: secondaryGoals,
      text: (profile.goals_text ?? '').slice(0, 160),
      skills: [...new Set((profile.goals_skills ?? []).map((s) => s.slice(0, 60)))].slice(0, 40),
      wants: knownIds(profile.goals_wants, WANT_IDS, 6),
    },
    settings: {
      publicProfile: profile.public_profile,
      showEmail: profile.show_email,
      publicPortfolio: profile.public_portfolio,
      notifyLessons: profile.notify_lessons,
      notifyWeekly: profile.notify_weekly,
      notifyNews: profile.notify_news,
      studyTime: oneOf(profile.study_time, ['manha', 'tarde', 'noite'] as const, 'noite'),
      captions: profile.captions,
      autoplay: profile.autoplay,
      reduceMotion: profile.reduce_motion,
    },
    notifications: [
      {
        id: 'n-boas-vindas',
        text: 'Boas-vindas à Folyo. Seu perfil está pronto para acompanhar seus aprendizados.',
        to: '/inicio',
        read: welcomeRead,
        date: joined,
      },
    ],
  }
}
