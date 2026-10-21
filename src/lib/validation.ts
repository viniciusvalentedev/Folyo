import { z } from 'zod'

/**
 * Regras de validação dos dados que entram no site (URLs e formulários).
 *
 * Hoje elas rodam no navegador para dar retorno rápido ao aluno. Quando o banco
 * existir, as MESMAS regras rodam de novo no servidor antes de gravar — nunca
 * confiamos só na validação do navegador, porque ela pode ser burlada.
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

export const emailSchema = z.string().trim().max(254).email('Digite um e-mail válido.')

/** Formulário de entrar. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(6, 'A senha precisa ter pelo menos 6 caracteres.').max(128),
})

/**
 * Formulário de criar conta.
 * Quando o Supabase Auth entrar, a senha vai direto para ele (que guarda só um hash).
 * Nosso código nunca deve salvar, registrar em log ou exibir a senha.
 */
export const signUpSchema = loginSchema.extend({
  name: z.string().trim().min(2, 'Digite seu nome.').max(80, 'Use no máximo 80 caracteres.'),
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

/** Dados pessoais (Configurações). */
export const personalDataSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(80),
  email: z.string().trim().max(254).email('Use um e-mail no formato nome@dominio.com.'),
  phone: z.string().trim().max(30),
  city: z.string().trim().max(80),
})

/** Editar perfil. */
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(80),
  headline: z.string().trim().max(LIMITS.title),
  city: z.string().trim().max(80),
  bio: z.string().max(400, 'Use até 400 caracteres.'),
  objective: z.string().max(500),
  interests: z.array(z.string().max(LIMITS.tag)).max(15),
})
