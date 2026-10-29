import { z } from 'zod'
import { brDate } from '@/lib/format'
import { SITE_URL } from '@/lib/seo'
import type { Catalog, Derived, Tone, UserState, Work } from '@/lib/types'
import { workFromRow } from '@/lib/domain/student-state'

/**
 * Perfil público (a página que qualquer pessoa abre pelo link /u/<endereço>).
 *
 * Este arquivo não tem nada de servidor: é usado pela tela de Configurações (para conferir o
 * endereço enquanto a pessoa digita), pela pré-visualização do portfólio, pela página pública,
 * pela rota do PDF e pelos testes. Quem decide de verdade o que é público é o BANCO (funções
 * `get_public_profile` e `set_my_slug`, em supabase/migrations/20261028000001_perfil_publico.sql):
 * as regras de endereço abaixo existem lá também e precisam ficar iguais.
 */

// ---------- Endereço (slug) ----------

export const SLUG_MIN = 3
export const SLUG_MAX = 30
/** Letras minúsculas e números, com hífen só no meio (sem hífen duplo). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Quantos dias a pessoa espera para trocar o endereço de novo (o primeiro é livre). */
export const SLUG_COOLDOWN_DAYS = 7

/**
 * Endereços que a pessoa não pode escolher: rotas do site, nomes da marca e da equipe.
 * (A mesma lista está em `private.reserved_slugs()` no SQL.)
 */
export const RESERVED_SLUGS: readonly string[] = [
  'admin', 'administrador', 'ajuda', 'api', 'app', 'aula', 'auth', 'certificados', 'competencias', 'configuracoes',
  'conta', 'contato', 'curriculo', 'curso', 'cursos', 'entrar', 'equipe', 'esqueci-senha', 'folyo', 'inicio', 'login',
  'logout', 'mfa', 'null', 'objetivos', 'oficial', 'perfil', 'primeiro-acesso', 'privacidade', 'progresso', 'projetos',
  'publico', 'redefinir-senha', 'robots', 'root', 'sair', 'seguranca', 'sitemap', 'staff', 'suporte', 'termos',
  'undefined', 'usefolyo', 'www',
]

/** "Vinícius  Valente!" -> "vinicius-valente". Sempre devolve algo que passa no formato (ou vazio). */
export function normalizeSlug(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '')
}

/** O que está errado com o endereço (já normalizado), em português; null se está tudo certo. */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Escolha um endereço para o seu perfil.'
  if (slug.length < SLUG_MIN) return `Use pelo menos ${SLUG_MIN} letras ou números.`
  if (slug.length > SLUG_MAX || !SLUG_PATTERN.test(slug)) return 'Use só letras minúsculas, números e hífen.'
  if (RESERVED_SLUGS.includes(slug)) return 'Este endereço é reservado. Escolha outro.'
  return null
}

/** Sugestão a partir do nome ("Maria da Silva" -> "maria-da-silva"); vazio se o nome não rende um endereço válido. */
export function suggestSlug(name: string): string {
  const slug = normalizeSlug(name)
  return slugProblem(slug) ? '' : slug
}

export const publicProfilePath = (slug: string) => `/u/${slug}`
export const publicProfileUrl = (slug: string) => `${SITE_URL}/u/${slug}`
/** Endereço de um PDF público (só abre se o perfil, o portfólio e o trabalho estiverem públicos). */
export const publicPdfUrl = (slug: string, workId: string, download?: boolean) =>
  `/api/u/${slug}/trabalhos/${workId}${download ? '?download=1' : ''}`

/** Mensagens da troca de endereço (códigos devolvidos pela função `set_my_slug` do banco). */
export const SLUG_ERRORS: Record<string, string> = {
  formato: 'Use de 3 a 30 letras minúsculas, números e hífen.',
  reservado: 'Este endereço é reservado. Escolha outro.',
  em_uso: 'Este endereço já está em uso. Escolha outro.',
  cedo: `Você já trocou o endereço há pouco tempo. Dá para trocar de novo a cada ${SLUG_COOLDOWN_DAYS} dias.`,
  sem_login: 'Sua sessão expirou. Entre de novo para continuar.',
  suspensa: 'Esta conta está suspensa.',
}

// ---------- O que a página pública mostra ----------

export type PortfolioCourse = {
  id: string
  title: string
  hours: number
  tone: Tone
  glyph: string
  seed: number
  complete: boolean
  /** AAAA-MM-DD */
  completedAt: string | null
  certified: boolean
}

export type PortfolioExperience = { id: string; role: string; org: string; period: string }

/** Tudo o que o portfólio mostra (a prévia do aluno e a página pública usam o mesmo formato). */
export type PortfolioData = {
  name: string
  headline: string
  bio: string
  city: string
  /** Objetivo (o texto dos Objetivos; na falta dele, o do currículo). */
  goal: string
  /** Vazio quando a pessoa não liberou o e-mail. */
  email: string
  experiences: PortfolioExperience[]
  /** Cursos concluídos e os cursos dos trabalhos públicos. */
  courses: PortfolioCourse[]
  /** Só trabalhos públicos (e só se o portfólio estiver público). */
  works: Work[]
}

/** Número fixo a partir do id do curso: a arte do curso fica igual na prévia e na página pública. */
export function artSeed(id: string): number {
  let n = 0
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 9973
  return n
}

/** A prévia do aluno, no mesmo formato da página pública (sem consultar o banco). */
export function portfolioFromState(s: UserState, d: Derived, catalog: Catalog): PortfolioData {
  const works = s.settings.publicPortfolio ? s.works.filter((w) => w.public) : []
  const withWorks = new Set(works.map((w) => w.courseId))
  const courses: PortfolioCourse[] = catalog.courses
    .filter((c) => d.courseStats[c.id]?.complete || withWorks.has(c.id))
    .map((c) => {
      const st = d.courseStats[c.id]
      return {
        id: c.id,
        title: c.title,
        hours: c.hours,
        tone: c.tone,
        glyph: c.glyph,
        seed: artSeed(c.id),
        complete: st.complete,
        completedAt: st.completedAt,
        certified: st.certified,
      }
    })
  return {
    name: s.user.name,
    headline: s.user.headline,
    bio: s.user.bio,
    city: s.user.city,
    goal: (s.goals.text || '').trim() || (s.user.objective || '').trim(),
    email: s.settings.showEmail ? s.user.email : '',
    experiences: s.user.experiences.map((x) => ({ id: x.id, role: x.role, org: x.org, period: x.period })),
    courses,
    works,
  }
}

// ---------- Resposta do banco (get_public_profile) ----------

/** Texto que o banco devolveu: corta no limite em vez de derrubar a página inteira. */
const clip = (max: number) => z.string().transform((v) => v.slice(0, max))
const TONES: readonly Tone[] = ['blue', 'magenta', 'ink', 'lime', 'paper']

const payloadSchema = z.object({
  name: clip(80),
  headline: clip(120).catch(''),
  bio: clip(1200).catch(''),
  city: clip(80).catch(''),
  goal: clip(300).catch(''),
  email: clip(120).nullable().catch(null),
  experiences: z
    .array(z.object({ id: clip(60), role: clip(120), org: clip(120), period: clip(120) }))
    .max(20)
    .catch([]),
  courses: z
    .array(
      z.object({
        id: clip(60),
        title: clip(90),
        hours: z.number().int().min(0).max(500).catch(0),
        tone: z.string().transform((t): Tone => (TONES as readonly string[]).includes(t) ? (t as Tone) : 'blue'),
        glyph: clip(3).catch(''),
        complete: z.boolean(),
        completed_at: z.string().nullable().catch(null),
        certified: z.boolean().catch(false),
      }),
    )
    .max(200)
    .catch([]),
  works: z.array(z.unknown()).max(60).catch([]),
})

/**
 * Confere a resposta do banco e monta o portfólio. Qualquer coisa fora do formato é descartada
 * (um trabalho estragado some da lista; um perfil sem nome vira "não encontrado").
 */
export function parsePublicProfile(raw: unknown): PortfolioData | null {
  const parsed = payloadSchema.safeParse(raw)
  if (!parsed.success || !parsed.data.name.trim()) return null
  const p = parsed.data
  const courseIds = new Set(p.courses.map((c) => c.id))

  const works: Work[] = []
  for (const item of p.works) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    // workFromRow confere título, endereço (só http/https) e arquivo; aqui só entra o que é público.
    const work = workFromRow({
      id: String(row.id ?? ''),
      course_id: typeof row.course_id === 'string' ? row.course_id : null,
      kind: String(row.kind ?? ''),
      title: String(row.title ?? ''),
      description: String(row.description ?? ''),
      url: typeof row.url === 'string' ? row.url : null,
      file_name: typeof row.file_name === 'string' ? row.file_name : null,
      file_size: typeof row.file_size === 'number' ? row.file_size : null,
      is_public: true,
      in_cv: false,
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.created_at ?? ''),
    })
    if (!work) continue
    // Trabalho de um curso que não veio na lista: mostra como "fora da Folyo" em vez de sumir.
    works.push({ ...work, courseId: work.courseId && courseIds.has(work.courseId) ? work.courseId : null })
  }

  return {
    name: p.name.trim(),
    headline: p.headline,
    bio: p.bio,
    city: p.city,
    goal: p.goal,
    email: p.email ?? '',
    experiences: p.experiences,
    courses: p.courses.map((c) => ({
      id: c.id,
      title: c.title,
      hours: c.hours,
      tone: c.tone,
      glyph: c.glyph,
      seed: artSeed(c.id),
      complete: c.complete,
      completedAt: c.complete && c.completed_at ? brDate(c.completed_at) || null : null,
      certified: c.complete && c.certified,
    })),
    works,
  }
}
