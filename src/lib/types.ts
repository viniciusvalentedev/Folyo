/**
 * Tipos do domínio da Folyo.
 *
 * Estes tipos descrevem os dados que o front usa hoje (dados de demonstração) e
 * servem de guia para modelar as tabelas no Supabase na próxima etapa.
 */

// ---------- Catálogo ----------

export type Tone = 'blue' | 'magenta' | 'ink' | 'lime' | 'paper'
export type Level = 'Iniciante' | 'Intermediário' | 'Avançado'
export type Plan = 'free' | 'pro'

export type Category = {
  id: string
  name: string
  /** Nome de um ícone do lucide (ver src/components/ui/Icon.tsx). */
  icon: string
}

export type Lesson = {
  id: string
  title: string
  /** Duração em minutos. */
  min: number
  /** Resumo da aula (algumas aulas ainda não têm). */
  desc?: string
}

export type Module = {
  id: string
  title: string
  lessons: Lesson[]
}

export type CourseProject = {
  title: string
  brief: string
  expected: string
  steps: string[]
}

export type Course = {
  id: string
  title: string
  cat: string
  level: Level
  hours: number
  tone: Tone
  glyph: string
  plan: Plan
  featured: boolean
  summary: string
  outcomes: string[]
  skills: string[]
  project: CourseProject
  modules: Module[]
}

/** Aula com a posição dentro do curso (índice do módulo e da aula). */
export type LessonRef = Lesson & { mi: number; li: number; module: string }

export type CareerGoal = {
  id: string
  title: string
  blurb: string
  skills: string[]
  courses: string[]
  projects: string[]
  keywords: string[]
}

// ---------- Usuário ----------

export type Education = { id: string; course: string; inst: string; period: string }

export type Experience = {
  id: string
  kind: 'profissional' | 'extracurricular'
  role: string
  org: string
  period: string
  desc: string
  skills?: string[]
}

export type LanguageItem = { id: string; name: string; level: string }
export type Achievement = { id: string; text: string }

export type UserProfile = {
  name: string
  first: string
  headline: string
  stage?: string
  city: string
  email: string
  phone: string
  link: string
  bio: string
  objective: string
  interests: string[]
  joined: string
  education: Education[]
  experiences: Experience[]
  languages: LanguageItem[]
  achievements: Achievement[]
}

/** Listas do perfil que podem ser editadas item a item. */
export type ProfileListKey = 'education' | 'experiences' | 'languages' | 'achievements'

export type ProjectStatus = 'andamento' | 'concluido' | 'revisao'

export type ProjectStep = { id: string; title: string; done: boolean; note: string }
export type ProjectLink = { id: string; label: string; url: string }

export type Project = {
  id: string
  /** Curso de origem (projetos feitos na Folyo). */
  courseId: string | null
  origin: 'curso' | 'externo'
  status: ProjectStatus
  tone: Tone
  title: string
  desc: string
  problem: string
  skills: string[]
  tools: string[]
  steps: ProjectStep[]
  result: string
  links: ProjectLink[]
  completedAt: string | null
  startedAt: string | null
  /** Projetos externos: contexto (ex.: escola, trabalho, voluntariado). */
  context?: string
  period?: string
}

export type SkillType = 'tecnica' | 'ferramenta' | 'idioma' | 'comportamental'

export type Skill = {
  id: string
  name: string
  type: SkillType
  inCV: boolean
  note: string
  createdAt: string
}

export type ResumeSection =
  | 'objetivo'
  | 'formacao'
  | 'experiencia'
  | 'projetos'
  | 'cursos'
  | 'competencias'
  | 'idiomas'
  | 'conquistas'

export type ResumeState = {
  template: 'classico' | 'moderno'
  order: ResumeSection[]
  hidden: ResumeSection[]
  projects: string[]
  certs: string[]
  savedAt: string | null
  dirty: boolean
}

export type Settings = {
  publicProfile: boolean
  showEmail: boolean
  publicPortfolio: boolean
  notifyLessons: boolean
  notifyWeekly: boolean
  notifyNews: boolean
  weeklyGoal: number
  studyTime: string
  captions: boolean
  autoplay: boolean
  reduceMotion: boolean
}

export type AppNotification = {
  id: string
  text: string
  to: string
  read: boolean
  date: string
}

/** Tudo o que pertence a um usuário. No banco, isso vira várias tabelas. */
export type UserState = {
  onboarded: boolean
  user: UserProfile
  /** id da aula -> data em que foi concluída (AAAA-MM-DD). */
  completed: Record<string, string>
  /** id do curso -> id da última aula aberta. */
  lastLesson: Record<string, string>
  /** id do curso -> true ou data em que começou. */
  started: Record<string, boolean | string>
  favorites: string[]
  /** id da aula -> anotação. */
  notes: Record<string, string>
  projects: Project[]
  skills: Skill[]
  resume: ResumeState
  goals: { primary: string | null; secondary: string[] }
  settings: Settings
  notifications: AppNotification[]
}

// ---------- Dados calculados ----------

export type CourseStatus = 'concluido' | 'iniciado' | 'disponivel'

export type CourseStats = {
  total: number
  done: number
  pct: number
  complete: boolean
  started: boolean
  status: CourseStatus
  startedAt: string | null
  completedAt: string | null
  nextLesson: LessonRef | null
  resume: LessonRef
  project: Project | null
  certified: boolean
  certDate: string | null
  minutesLeft: number
}

export type Certificate = {
  id: string
  course: Course
  date: string
  code: string
  inCV: boolean
}

export type EvidenceKind = 'curso' | 'projeto' | 'experiencia' | 'certificado' | 'nota'

export type Evidence = {
  kind: EvidenceKind
  label: string
  detail: string
  to?: string
  strong: boolean
}

export type SkillWithEvidence = Skill & {
  evidence: Evidence[]
  /** 0 = declarada, 1 = aprendida, 2 = praticada, 3 = demonstrada */
  level: 0 | 1 | 2 | 3
  learned: boolean
  practiced: boolean
  demonstrated: boolean
}

export type ResumeGapAction =
  | 'suggest-objetivo'
  | 'focus-objetivo'
  | 'add-projects'
  | 'focus-idiomas'
  | 'register-skills'
  | 'add-certs'
  | 'go-skills'
  | 'add-link'

export type ResumeGap = {
  id: string
  sev: 'alta' | 'media' | 'baixa'
  title: string
  body: string
  action: ResumeGapAction
  cta: string
  ids?: string[]
  names?: string[]
}

export type ResumeCheck = { label: string; w: number; ok: boolean; partial?: boolean }

export type Derived = {
  courseStats: Record<string, CourseStats>
  certificates: Certificate[]
  inProgress: Course[]
  completedCourses: Course[]
  projectsDone: Project[]
  skills: SkillWithEvidence[]
  goal: CareerGoal | null
  gaps: ResumeGap[]
  strengths: string[]
  checks: ResumeCheck[]
  completeness: number
  cvProjects: Project[]
  unregisteredCourseSkills: string[]
  lessonsDone: number
}

export type Catalog = {
  courses: Course[]
  categories: Category[]
  goals: CareerGoal[]
}
