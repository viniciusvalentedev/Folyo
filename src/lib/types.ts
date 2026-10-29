/**
 * Tipos do domínio da Folyo.
 *
 * Descrevem os dados que a tela usa. O que é do aluno vem do banco (tabelas
 * profiles, course_progress, lesson_completions, lesson_notes, lesson_watch, works
 * e skills); o catálogo vem das tabelas categories, courses, course_modules, lessons e
 * lesson_materials (cadastradas no painel). O formato usado pelo painel fica em
 * src/lib/admin/catalog.ts.
 */

// ---------- Catálogo ----------

import type { StudentImages } from '@/lib/media'

export type Tone = 'blue' | 'magenta' | 'ink' | 'lime' | 'paper'
export type Level = 'Iniciante' | 'Intermediário' | 'Avançado'
export type Plan = 'free' | 'pro'

export type Category = {
  id: string
  name: string
  /** Nome de um ícone do lucide (ver src/components/ui/Icon.tsx). */
  icon: string
  /** Categoria desativada some dos filtros de Explorar cursos (os cursos continuam). */
  active?: boolean
  /** Imagem da categoria (endereço público), quando a equipe escolheu uma. */
  image?: string
}

export type Lesson = {
  id: string
  title: string
  /** Duração em minutos. */
  min: number
  /** Resumo da aula (algumas aulas ainda não têm). */
  desc?: string
  /** Vídeo: link (https) ou vídeo hospedado no Bunny Stream. Sem vídeo, o aluno vê um aviso. */
  video?: LessonVideo | null
  /** Links e arquivos complementares da aula. */
  materials?: LessonMaterial[]
}

export type LessonVideo = { kind: 'link'; url: string } | { kind: 'bunny'; id: string }

/** `url` já é o endereço para abrir (link externo, ou /api/materiais/<id> quando é um arquivo da biblioteca). */
export type LessonMaterial = { id: string; label: string; url: string; file?: { name: string; size: number } }

export type Module = {
  id: string
  title: string
  lessons: Lesson[]
}

/** Projeto que o curso pede para o certificado: o aluno envia o resultado (PDF ou link). */
export type CourseProject = {
  title: string
  brief: string
  expected: string
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
  /** Curso recomendado: sobe na ordenação por relevância. */
  recommended?: boolean
  /** Publicado, mas fora do catálogo: só abre por link direto. */
  hidden?: boolean
  /** Campos opcionais preenchidos pelo painel da equipe. */
  subtitle?: string
  description?: string
  instructor?: string
  language?: string
  audience?: string
  /** Ids de cursos que a pessoa deve fazer antes. */
  prerequisites?: string[]
  /** `arquivado` = não recebe novas matrículas, mas quem já começou continua. */
  status?: 'publicado' | 'arquivado'
  outcomes: string[]
  skills: string[]
  /** Sem título = o curso não pede projeto. */
  project: CourseProject
  /** `enabled: false` = sem certificado. `hours` e `note` (opcionais) aparecem no certificado. */
  certificate?: { enabled: boolean; hours?: number; note?: string }
  modules: Module[]
  /** Capa, miniatura e banner (imagens da biblioteca de mídia). Sem imagem, vale a arte padrão. */
  images?: StudentImages
}

/** Aula com a posição dentro do curso (índice do módulo e da aula). */
export type LessonRef = Lesson & { mi: number; li: number; module: string }

export type Catalog = {
  courses: Course[]
  categories: Category[]
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
  /** Id do momento de vida escolhido no primeiro acesso (ver LIFE_STAGES). */
  stage: string
  /** Marcou "ainda estou descobrindo meus interesses". */
  exploring: boolean
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

/** Material que o aluno anexa a um curso (ou a "fora da Folyo"): um link ou um PDF. */
export type WorkKind = 'link' | 'pdf'

export type Work = {
  id: string
  /** Curso do trabalho; null = feito fora da Folyo. */
  courseId: string | null
  kind: WorkKind
  title: string
  desc: string
  /** Endereço (só links). */
  url: string | null
  /** Dados do arquivo (só PDFs). O arquivo em si fica no Storage e só o dono abre. */
  file: { name: string; size: number } | null
  public: boolean
  inCV: boolean
  /** Momento do envio (ISO) e da última alteração. */
  createdAt: string
  updatedAt: string
}

export type WorkEntry = Work & { course: Course | null }

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

export type Goals = {
  /** Trilha principal (ver TRAILS). */
  primary: string | null
  secondary: string[]
  /** Objetivo escrito pelo aluno, com as próprias palavras. */
  text: string
  /** Skills que o aluno quer desenvolver. */
  skills: string[]
  /** O que ele quer conquistar (respostas do primeiro acesso). */
  wants: string[]
}

/** Tudo o que pertence a um usuário. No banco, isso vira várias tabelas. */
export type UserState = {
  onboarded: boolean
  /** E-mail usado para entrar (vem da sessão; o do currículo é user.email e pode ser outro). */
  accountEmail: string
  /** Papel na equipe (aluno = sem acesso ao painel). Só decide o que a tela mostra; quem protege é o banco. */
  role: 'aluno' | 'editor' | 'admin' | 'proprietario'
  user: UserProfile
  /** Endereço do perfil público (/u/<endereço>); vazio = ainda não escolheu. Só muda pela ação própria, nunca por saveSettings. */
  publicSlug: string
  /** id da aula -> data em que foi concluída (AAAA-MM-DD). */
  completed: Record<string, string>
  /** id do curso -> id da última aula aberta. */
  lastLesson: Record<string, string>
  /** id do curso -> true ou data em que começou. */
  started: Record<string, boolean | string>
  favorites: string[]
  /** id da aula -> anotação. */
  notes: Record<string, string>
  /** id da aula -> segundos de vídeo assistidos (medidos pelo player). */
  watch: Record<string, number>
  works: Work[]
  skills: Skill[]
  resume: ResumeState
  goals: Goals
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
  /** Trabalhos enviados neste curso. */
  works: Work[]
  /** O aluno já enviou pelo menos um material neste curso. */
  delivered: boolean
  deliveredAt: string | null
  /** O curso pede projeto para o certificado. */
  offersProject: boolean
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


/** Uma aula concluída no histórico de estudo. */
export type DoneEntry = { lid: string; cid: string; date: string }

/** Quanto do que foi estudado cabe em cada skill (dividido entre as skills do curso). */
export type SkillMix = {
  items: { name: string; value: number; pct: number; share: number; courses: { id: string; title: string; lessons: number; share: number }[] }[]
  counted: number
  uncounted: number
}

export type Metrics = {
  lessonsDone: number
  watchSec: number
  coursesCompleted: number
  coursesStarted: number
  certificates: number
  projectsAdded: number
  coursesWithProject: number
  attachments: number
  certPending: number
}

export type Derived = {
  courseStats: Record<string, CourseStats>
  certificates: Certificate[]
  inProgress: Course[]
  completedCourses: Course[]
  /** Todos os trabalhos do aluno, do mais novo para o mais antigo, com o curso de cada um. */
  works: WorkEntry[]
  skills: SkillWithEvidence[]
  goal: import('@/lib/trails').Trail | null
  /** Situação do objetivo profissional do currículo. */
  objectiveStatus: 'ok' | 'vazio' | 'generico'
  completeness: number
  /** Trabalhos marcados para aparecer no currículo. */
  cvProjects: WorkEntry[]
  lessonsDone: number
  skillMix: SkillMix
  metrics: Metrics
  doneLog: DoneEntry[]
}
