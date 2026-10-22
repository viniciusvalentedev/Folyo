import { z } from 'zod'

/**
 * Regras de validação dos dados que entram no site (URLs e formulários).
 *
 * As mesmas regras rodam no navegador (retorno rápido para o aluno) e de novo no
 * servidor, antes de falar com o Supabase. Nunca confiamos só no navegador,
 * porque ele pode ser burlado. O banco ainda tem os próprios limites (CHECK).
 */

/** Ids que aparecem na URL (cursos, aulas, projetos): só letras minúsculas, números e hífen. */
export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/)

export function isValidSlug(value: string) {
  return slugSchema.safeParse(value).success
}

/** Link externo: só http(s), para ninguém conseguir salvar um "javascript:" malicioso. */
export const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }, 'Use um link que comece com https://')

export function safeUrl(value: string | null | undefined) {
  return value && urlSchema.safeParse(value).success ? value : null
}

export const emailSchema = z.string().trim().toLowerCase().max(254).email('Digite um e-mail válido.')

/** Senha nova: mínimo 8 caracteres (o Supabase aceita no máximo 72). */
export const newPasswordSchema = z
  .string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres.')
  .max(72, 'Use no máximo 72 caracteres.')

export const personNameSchema = z.string().trim().min(2, 'Digite seu nome.').max(80, 'Use no máximo 80 caracteres.')

/**
 * Formulário de entrar. Aqui não exigimos tamanho mínimo: quem decide se a senha
 * está certa é o Supabase. A senha nunca é salva, registrada em log ou exibida.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Digite sua senha.').max(72, 'Senha muito longa.'),
})

/** Formulário de criar conta. A senha vai direto para o Supabase, que guarda só um hash. */
export const signUpSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: newPasswordSchema,
})

/** "Esqueci minha senha". */
export const emailOnlySchema = z.object({ email: emailSchema })

/** Criar nova senha (com confirmação). */
export const resetPasswordSchema = z
  .object({ password: newPasswordSchema, confirm: z.string().max(72) })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não são iguais.' })

/** Link que chega por e-mail (confirmar conta ou criar nova senha). */
export const emailLinkSchema = z.object({
  token_hash: z.string().regex(/^[A-Za-z0-9_-]{8,256}$/),
  type: z.enum(['email', 'signup', 'recovery', 'email_change']),
})

/** Transforma os erros do zod em { campo: mensagem } para mostrar no formulário. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/** Limites de tamanho dos textos (evita abusos e textos gigantes no banco). */
export const LIMITS = {
  title: 120,
  short: 200,
  text: 2000,
  long: 3000,
  tag: 60,
} as const

/** Formulário de projeto (novo projeto externo ou edição). */
export const projectFormSchema = z.object({
  title: z.string().trim().min(1, 'Dê um nome ao projeto.').max(LIMITS.title),
  desc: z.string().trim().max(LIMITS.short),
  problem: z
    .string()
    .trim()
    .min(1, 'Explique em uma ou duas frases o problema que o projeto resolve.')
    .max(LIMITS.text),
  skills: z.array(z.string().max(LIMITS.tag)).min(1, 'Escolha pelo menos uma habilidade demonstrada.').max(20),
  tools: z.array(z.string().max(LIMITS.tag)).max(20),
  result: z.string().max(LIMITS.long),
  links: z
    .array(
      z.object({
        label: z.string().max(LIMITS.title),
        url: z.string().refine((v) => !v.trim() || urlSchema.safeParse(v).success, 'Links precisam começar com http:// ou https://'),
      }),
    )
    .max(10),
})

/** Formulário de competência. */
export const skillFormSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à competência.').max(LIMITS.tag),
  type: z.enum(['tecnica', 'ferramenta', 'idioma', 'comportamental']),
  note: z.string().max(LIMITS.short * 2),
  inCV: z.boolean(),
})

/** Dados pessoais (Configurações): por enquanto só o nome fica salvo no banco. */
export const personalDataSchema = z.object({ name: personNameSchema })

/** Ids de objetivos e cursos (iguais aos do catálogo). */
const idSchema = z.string().regex(/^[a-z0-9-]{1,40}$/)

/** Respostas do primeiro acesso. */
export const onboardingSchema = z.object({
  goal: idSchema,
  stage: z.string().min(1).max(120),
  weekly: z.number().int().min(1).max(20),
})

/** Objetivos de carreira (1 principal + até 2 acompanhados). */
export const goalsSchema = z.object({
  primary: idSchema,
  secondary: z.array(idSchema).max(2),
})

export const weeklyGoalSchema = z.number().int().min(1).max(20)

/** Editar perfil. */
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(80),
  headline: z.string().trim().max(LIMITS.title),
  city: z.string().trim().max(80),
  bio: z.string().max(400, 'Use até 400 caracteres.'),
  objective: z.string().max(500),
  interests: z.array(z.string().max(LIMITS.tag)).max(15),
})

// ---------------------------------------------------------------------------
// Etapa 2: o que vai para o banco.
//
// Estas regras rodam no SERVIDOR (Server Actions) antes de gravar e também na
// LEITURA (o que vem do banco é conferido de novo antes de ir para a tela, porque
// um aluno pode gravar direto na API do Supabase com o próprio login).
// Os limites aqui são iguais ou menores que os do banco (CHECK na migration).
// ---------------------------------------------------------------------------

/** Ids de cursos e aulas do catálogo (ex.: "mkt", "mkt-3"). */
export const catalogIdSchema = idSchema

/** Ids de projetos e competências: uuid gerado no navegador (crypto.randomUUID). */
export const uuidSchema = z.uuid()

/** Ids de itens dentro de listas (passos, links, formação...). */
export const itemIdSchema = z.string().regex(/^[a-z0-9-]{1,40}$/)

const text = (max: number) => z.string().max(max)
const tagList = (maxItems: number) => z.array(z.string().trim().min(1).max(LIMITS.tag)).max(maxItems)

/** Tamanho em bytes como o banco conta (com folga: o Postgres guarda o JSON com alguns espaços a mais). */
function jsonBytes(value: unknown) {
  return new TextEncoder().encode(JSON.stringify(value)).length
}
const fitsBytes = (max: number) => (value: unknown) => jsonBytes(value) <= max * 0.85

/** Máximo de itens em cada lista do perfil (a tela também usa estes números). */
export const LIST_MAX = {
  education: 20,
  experiences: 20,
  languages: 15,
  achievements: 30,
  interests: 15,
} as const

export const lessonDoneSchema = z.object({ courseId: idSchema, lessonId: idSchema, done: z.boolean() })

export const courseProgressSchema = z.object({
  courseId: idSchema,
  started: z.boolean(),
  lastLessonId: idSchema.nullable(),
  favorite: z.boolean(),
})

export const NOTE_MAX = 5000
export const lessonNoteSchema = z.object({ courseId: idSchema, lessonId: idSchema, body: text(NOTE_MAX) })

/** Link de projeto: vazio ou http(s). */
const projectLinkUrl = z.string().trim().max(500).refine((v) => !v || urlSchema.safeParse(v).success)

export const storedProjectSchema = z.object({
  id: uuidSchema,
  courseId: idSchema.nullable(),
  origin: z.enum(['curso', 'externo']),
  status: z.enum(['andamento', 'concluido', 'revisao']),
  tone: z.enum(['blue', 'magenta', 'ink', 'lime', 'paper']),
  title: z.string().trim().min(1).max(LIMITS.title),
  desc: text(LIMITS.short),
  problem: text(LIMITS.text),
  skills: tagList(20),
  tools: tagList(20),
  steps: z
    .array(z.object({ id: itemIdSchema, title: text(LIMITS.title), done: z.boolean(), note: text(LIMITS.text) }))
    .max(30)
    .refine(fitsBytes(65536), 'Os passos do projeto ficaram grandes demais.'),
  result: text(LIMITS.long),
  links: z
    .array(z.object({ id: itemIdSchema, label: text(LIMITS.title), url: projectLinkUrl }))
    .max(10)
    .refine(fitsBytes(16384)),
})

export const storedSkillSchema = z.object({
  id: uuidSchema,
  name: z.string().trim().min(1).max(LIMITS.tag),
  type: z.enum(['tecnica', 'ferramenta', 'idioma', 'comportamental']),
  inCV: z.boolean(),
  note: text(LIMITS.short * 2),
})

export const educationSchema = z.object({
  id: itemIdSchema,
  course: text(LIMITS.short),
  inst: text(LIMITS.short),
  period: text(LIMITS.short),
})
export const experienceSchema = z.object({
  id: itemIdSchema,
  kind: z.enum(['profissional', 'extracurricular']),
  role: text(LIMITS.short),
  org: text(LIMITS.short),
  period: text(LIMITS.short),
  desc: text(LIMITS.text),
  skills: tagList(10).optional(),
})
export const languageSchema = z.object({ id: itemIdSchema, name: text(40), level: text(40) })
export const achievementSchema = z.object({ id: itemIdSchema, text: text(LIMITS.short) })

/**
 * Perfil e dados do currículo (salvos automaticamente enquanto o aluno digita).
 * Por isso aceitam campo vazio: a pessoa pode estar no meio da edição.
 * E-mail de contato, telefone e link são só TEXTO no currículo; se um dia virarem
 * link clicável, passe por safeUrl() antes.
 */
export const storedProfileSchema = z.object({
  name: z.string().trim().max(80),
  headline: text(LIMITS.title),
  city: text(80),
  email: text(254),
  phone: text(30),
  link: text(200),
  bio: text(400),
  objective: text(500),
  interests: tagList(LIST_MAX.interests),
  education: z.array(educationSchema).max(LIST_MAX.education).refine(fitsBytes(32768)),
  experiences: z.array(experienceSchema).max(LIST_MAX.experiences).refine(fitsBytes(131072)),
  languages: z.array(languageSchema).max(LIST_MAX.languages).refine(fitsBytes(8192)),
  achievements: z.array(achievementSchema).max(LIST_MAX.achievements).refine(fitsBytes(32768)),
})

/**
 * Para gravar, o site manda SÓ os campos que mudaram (assim uma aba antiga aberta
 * não desfaz o que você mudou em outra aba ou no celular). Pelo menos um campo.
 */
const atLeastOne = (v: object) => Object.values(v).some((x) => x !== undefined)
export const profilePatchSchema = storedProfileSchema.partial().refine(atLeastOne)

const resumeSectionSchema = z.enum([
  'objetivo',
  'formacao',
  'experiencia',
  'projetos',
  'cursos',
  'competencias',
  'idiomas',
  'conquistas',
])

export const storedResumeSchema = z.object({
  template: z.enum(['classico', 'moderno']),
  order: z.array(resumeSectionSchema).max(8),
  hidden: z.array(resumeSectionSchema).max(8),
  projects: z.array(uuidSchema).max(100),
  certs: z.array(idSchema).max(100),
})
export const resumePatchSchema = storedResumeSchema.partial().refine(atLeastOne)

export const storedSettingsSchema = z.object({
  publicProfile: z.boolean(),
  showEmail: z.boolean(),
  publicPortfolio: z.boolean(),
  notifyLessons: z.boolean(),
  notifyWeekly: z.boolean(),
  notifyNews: z.boolean(),
  weeklyGoal: weeklyGoalSchema,
  studyTime: z.enum(['manha', 'tarde', 'noite']),
  captions: z.boolean(),
  autoplay: z.boolean(),
  reduceMotion: z.boolean(),
})
export const settingsPatchSchema = storedSettingsSchema.partial().refine(atLeastOne)
