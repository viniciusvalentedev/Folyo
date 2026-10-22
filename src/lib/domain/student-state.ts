import type { z } from 'zod'
import { findCourse, findLesson } from '@/lib/domain/catalog'
import type { Catalog, Project, ResumeSection, Skill, UserState } from '@/lib/types'
import {
  achievementSchema,
  educationSchema,
  experienceSchema,
  languageSchema,
  storedProjectSchema,
  storedSkillSchema,
} from '@/lib/validation'

/** Linhas como vêm do banco (só as colunas que o site lê). */
export type ProfileRow = {
  name: string
  stage: string | null
  goal_primary: string | null
  goals_secondary: string[]
  weekly_goal: number
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
  resume_projects: string[]
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
export type ProjectRow = {
  id: string
  course_id: string | null
  origin: string
  status: string
  tone: string
  title: string
  description: string
  problem: string
  skills: string[]
  tools: string[]
  steps: unknown
  result: string
  links: unknown
  started_at: string
  completed_at: string | null
}
export type SkillRow = { id: string; name: string; type: string; in_cv: boolean; note: string; created_at: string }

export type StudentRows = {
  profile: ProfileRow
  email: string
  role: UserState['role']
  progress: CourseProgressRow[]
  completions: LessonCompletionRow[]
  notes: LessonNoteRow[]
  projects: ProjectRow[]
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

/** O público da Folyo é do Brasil: as datas do banco viram AAAA-MM-DD no horário de Brasília. */
const BR_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export function brDate(timestamp: string) {
  const d = new Date(timestamp)
  return Number.isNaN(d.getTime()) ? '' : BR_DATE.format(d)
}

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

  const projects: Project[] = []
  for (const r of rows.projects) {
    const parsed = storedProjectSchema.safeParse({
      id: r.id,
      courseId: r.course_id,
      origin: r.origin,
      status: r.status,
      tone: r.tone,
      title: r.title,
      desc: r.description,
      problem: r.problem,
      skills: r.skills,
      tools: r.tools,
      steps: Array.isArray(r.steps) ? r.steps : [],
      result: r.result,
      links: Array.isArray(r.links) ? r.links : [],
    })
    if (!parsed.success) continue
    if (parsed.data.courseId && !findCourse(catalog, parsed.data.courseId)) continue
    projects.push({
      ...parsed.data,
      completedAt: r.completed_at ? brDate(r.completed_at) : null,
      startedAt: brDate(r.started_at),
    })
  }
  const projectIds = new Set(projects.map((p) => p.id))

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

  const goalIds = new Set(catalog.goals.map((g) => g.id))
  const primaryGoal = profile.goal_primary && goalIds.has(profile.goal_primary) ? profile.goal_primary : null
  const secondaryGoals = (profile.goals_secondary ?? []).filter((g) => goalIds.has(g) && g !== primaryGoal).slice(0, 2)

  return {
    onboarded: profile.onboarded,
    accountEmail: email,
    role: rows.role,
    user: {
      name,
      first: name.split(' ')[0] || name,
      headline: profile.headline || profile.stage || '',
      stage: profile.stage ?? '',
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
    projects,
    skills,
    resume: {
      template: oneOf(profile.resume_template, ['classico', 'moderno'] as const, 'classico'),
      order,
      hidden: profile.resume_hidden.filter((x): x is ResumeSection => (RESUME_SECTIONS as string[]).includes(x)),
      projects: profile.resume_projects.filter((id) => projectIds.has(id)),
      certs: profile.resume_certs.filter((id) => courseIds.has(id)),
      savedAt: profile.updated_at,
      dirty: false,
    },
    goals: { primary: primaryGoal, secondary: secondaryGoals },
    settings: {
      publicProfile: profile.public_profile,
      showEmail: profile.show_email,
      publicPortfolio: profile.public_portfolio,
      notifyLessons: profile.notify_lessons,
      notifyWeekly: profile.notify_weekly,
      notifyNews: profile.notify_news,
      weeklyGoal: profile.weekly_goal,
      studyTime: oneOf(profile.study_time, ['manha', 'tarde', 'noite'] as const, 'noite'),
      captions: profile.captions,
      autoplay: profile.autoplay,
      reduceMotion: profile.reduce_motion,
    },
    notifications: [
      {
        id: 'n-boas-vindas',
        text: 'Boas-vindas à Folyo. Comece pelo curso recomendado para o seu objetivo.',
        to: '/inicio',
        read: welcomeRead,
        date: joined,
      },
    ],
  }
}
