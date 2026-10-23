import { z } from 'zod'
import { AREA_IDS, STAGE_IDS, TRAIL_IDS, WANT_IDS } from '@/lib/trails'

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

/**
 * Tira de nomes os caracteres invisíveis, de controle e o "·" (usado como separador
 * no histórico do painel). Sem isso, alguém poderia se passar por outra pessoa lá.
 * O banco também recusa esses caracteres (etapa 4b).
 */
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff\u00b7]/g
export const cleanName = (v: string) => v.replace(UNSAFE_NAME_CHARS, '').replace(/\s{2,}/g, ' ').trim()

export const personNameSchema = z
  .string()
  .transform(cleanName)
  .pipe(z.string().min(2, 'Digite seu nome.').max(80, 'Use no máximo 80 caracteres.'))

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

/** Formulário de competência. */
export const skillFormSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à competência.').max(LIMITS.tag),
  type: z.enum(['tecnica', 'ferramenta', 'idioma', 'comportamental']),
  note: z.string().max(LIMITS.short * 2),
  inCV: z.boolean(),
})

/** Dados pessoais (Configurações). O nome vai por `saveName`; cidade e telefone, pelo perfil. */
export const personalDataSchema = z.object({
  name: personNameSchema,
  city: z.string().trim().max(80),
  phone: z.string().trim().max(30),
})

/** Ids de objetivos e cursos (iguais aos do catálogo). */
const idSchema = z.string().regex(/^[a-z0-9-]{1,40}$/)

/** Respostas do primeiro acesso: só ids das listas de src/lib/trails.ts. */
export const onboardingSchema = z.object({
  stage: z.enum(STAGE_IDS as [string, ...string[]]),
  areas: z.array(z.enum(AREA_IDS as [string, ...string[]])).max(AREA_IDS.length),
  wants: z.array(z.enum(WANT_IDS as [string, ...string[]])).max(WANT_IDS.length),
})

/** Objetivos de carreira. Só os campos que mudaram (pelo menos um). */
export const GOAL_TEXT_MAX = 160
export const goalsPatchSchema = z
  .object({
    primary: z.enum(TRAIL_IDS as [string, ...string[]]).nullable(),
    secondary: z.array(z.enum(TRAIL_IDS as [string, ...string[]])).max(2),
    text: z.string().max(GOAL_TEXT_MAX),
    skills: z.array(z.string().trim().min(1).max(60)).max(40),
    wants: z.array(z.enum(WANT_IDS as [string, ...string[]])).max(WANT_IDS.length),
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined))

/** Editar perfil. */
export const profileSchema = z.object({
  name: z.string().transform(cleanName).pipe(z.string().min(1, 'Informe seu nome.').max(80)),
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

// ---------- Trabalhos (PDF ou link) ----------

export const WORK_TITLE_MAX = 90
export const WORK_DESC_MAX = 280
export const MAX_PDF_BYTES = 20 * 1024 * 1024
export const MAX_WORKS = 100
export const MAX_PDFS = 40

const workBase = z.object({
  id: uuidSchema,
  courseId: idSchema.nullable(),
  kind: z.enum(['link', 'pdf']),
  title: z.string().trim().min(1).max(WORK_TITLE_MAX),
  desc: text(WORK_DESC_MAX),
  public: z.boolean(),
  inCV: z.boolean(),
})

/** O que o aluno pode mudar num trabalho (o arquivo de um PDF não passa por aqui). */
export const workEditSchema = workBase
  .extend({ url: urlSchema.nullable() })
  .refine((w) => (w.kind === 'link') === (w.url !== null), 'Links têm endereço; PDFs não.')

/** Como o trabalho volta do banco (conferido de novo antes de ir para a tela). */
export const storedWorkSchema = workBase
  .extend({
    url: urlSchema.nullable(),
    file: z.object({ name: z.string().min(1).max(200), size: z.number().int().min(5).max(MAX_PDF_BYTES) }).nullable(),
  })
  .refine(
    (w) => (w.kind === 'link' ? w.url !== null && w.file === null : w.url === null && w.file !== null),
    'Trabalho com dados misturados.',
  )

/**
 * Endereço digitado pelo aluno → endereço seguro. Aceita "site.com" (coloca https://),
 * só aceita http(s) e exige um domínio com ponto. Roda na tela e de novo no servidor.
 */
export function normalizeWorkUrl(raw: string): { url: string; host: string } | { error: string } {
  let value = (raw || '').trim()
  if (!value) return { error: 'Informe o endereço do link.' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { error: 'Esse endereço não parece ser um link válido.' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { error: 'Use um link que comece com http:// ou https://' }
  }
  if (!parsed.hostname.includes('.')) return { error: 'Esse endereço não parece ser um link válido.' }
  if (parsed.href.length > 500) return { error: 'Esse endereço é longo demais (máximo de 500 caracteres).' }
  return { url: parsed.href, host: parsed.hostname.replace(/^www\./, '') }
}

/** Pedido para enviar um PDF: o servidor devolve um endereço de envio válido por pouco tempo. */
export const pdfUploadRequestSchema = z.object({
  size: z.number().int().min(5, 'O arquivo está vazio.').max(MAX_PDF_BYTES, 'O limite é de 20 MB.'),
})

/** Depois do envio, o servidor confere o arquivo e só então cria (ou troca) o trabalho. */
export const pdfConfirmNewSchema = z.object({
  fileId: z.uuid(),
  courseId: idSchema.nullable(),
  fileName: z.string().min(1).max(300),
  title: z.string().trim().max(WORK_TITLE_MAX),
})
export const pdfConfirmReplaceSchema = z.object({
  fileId: z.uuid(),
  workId: uuidSchema,
  fileName: z.string().min(1).max(300),
})

/** Tempo assistido de uma aula (total em segundos). */
export const lessonWatchSchema = z.object({
  courseId: idSchema,
  lessonId: idSchema,
  seconds: z.number().int().min(1).max(86400),
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
  name: z.string().transform(cleanName).pipe(z.string().max(80)),
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
  studyTime: z.enum(['manha', 'tarde', 'noite']),
  captions: z.boolean(),
  autoplay: z.boolean(),
  reduceMotion: z.boolean(),
})
export const settingsPatchSchema = storedSettingsSchema.partial().refine(atLeastOne)
