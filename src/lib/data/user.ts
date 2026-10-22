import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { z } from 'zod'
import { ROLE_KEYS, type Role } from '@/lib/admin/roles'
import { getCatalog } from '@/lib/data/catalog'
import {
  stateFromRows,
  type CourseProgressRow,
  type LessonCompletionRow,
  type LessonNoteRow,
  type ProfileRow,
  type ProjectRow,
  type SkillRow,
} from '@/lib/domain/student-state'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { UserState } from '@/lib/types'

/**
 * Camada de acesso a dados do ALUNO LOGADO (DAL).
 *
 * Toda leitura de dados do aluno passa por aqui, e aqui a sessão é conferida
 * de verdade (assinatura do token), mesmo que o proxy já tenha olhado antes.
 * Toda consulta filtra por user_id E o banco ainda aplica o RLS: mesmo com um bug
 * aqui, ninguém lê dados de outra pessoa.
 *
 * `cache` evita repetir a mesma consulta várias vezes na mesma página.
 */

export type SessionUser = { id: string; email: string }

/** Aluno logado ou null. Nunca use getSession() no servidor para isso (o cookie pode ser falsificado). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient()
  // Cookie corrompido ou forjado pode fazer o getClaims lançar erro: vale como "não logado".
  const result = await supabase.auth.getClaims().catch(() => null)
  const claims = result?.data?.claims
  if (!result || result.error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
})

/** Aluno logado; se não houver, manda para /entrar. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/entrar')
  return user
}

export type Account = { role: Role; suspended: boolean }

const accountSchema = z.object({ role: z.enum(ROLE_KEYS as [Role, ...Role[]]), suspended: z.boolean() })

/**
 * Papel na equipe e se a conta está suspensa (função my_account do banco, que só
 * responde sobre a PRÓPRIA conta). Na dúvida, trata como aluno: nunca dá acesso a mais.
 */
export const getAccount = cache(async (): Promise<Account> => {
  await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('my_account')
  if (error) {
    // PGRST202 = a função ainda não existe (SQL da etapa 4 não rodado). O site segue como antes.
    if (error.code === 'PGRST202') {
      console.error('Função my_account não encontrada: rode o SQL da etapa 4 no Supabase.')
      return { role: 'aluno', suspended: false }
    }
    // O Next encerra consultas ainda abertas quando termina um teste de pré-renderização
    // ("During prerendering, fetch() rejects..."). Não é falha real: não polui o log.
    if (!/During prerendering/i.test(error.message ?? '')) console.error('Falha ao ler a conta', { code: error.code })
    throw new Error('Não foi possível carregar sua conta agora.')
  }
  const parsed = accountSchema.safeParse(data)
  // Resposta inesperada do banco: não arrisca (nem painel, nem conta liberada).
  if (!parsed.success) throw new Error('Não foi possível carregar sua conta agora.')
  return parsed.data
})

/** Colunas lidas do perfil (nunca "select *": coluna nova não vaza sem querer para a tela). */
const PROFILE_COLUMNS = [
  'name, stage, goal_primary, goals_secondary, weekly_goal, onboarded, created_at, updated_at',
  'headline, city, contact_email, phone, link, bio, objective, interests',
  'education, experiences, languages, achievements',
  'resume_template, resume_order, resume_hidden, resume_projects, resume_certs',
  'public_profile, public_portfolio, show_email, notify_lessons, notify_weekly, notify_news',
  'study_time, captions, autoplay, reduce_motion, notifications_read_at',
].join(', ')

/** Perfil do aluno logado (lido com as regras RLS: só a própria linha). */
export const getProfile = cache(async (): Promise<{ user: SessionUser; profile: ProfileRow; account: Account }> => {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()
  const [account, { data, error }] = await Promise.all([
    getAccount(),
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single(),
  ])
  // Conta suspensa: o banco já não mostra nada; aqui só levamos para a página que explica.
  if (account.suspended) redirect('/conta-suspensa')
  if (error || !data) {
    // Sem detalhes técnicos para quem está usando; o erro completo fica no log do servidor.
    console.error('Perfil não encontrado', { userId: user.id, code: error?.code })
    throw new Error('Não encontramos o seu perfil.')
  }
  return { user, profile: data as unknown as ProfileRow, account }
})

/** Estado inicial da área do aluno (vai para o navegador já filtrado e conferido). */
export async function getCurrentUserState(): Promise<UserState> {
  const [{ user, profile, account }, catalog] = await Promise.all([getProfile(), getCatalog()])
  const supabase = await createSupabaseServerClient()

  // Os limites (.limit) são um pouco maiores que os do banco: só uma proteção extra.
  const [progress, completions, notes, projects, skills] = await Promise.all([
    supabase
      .from('course_progress')
      .select('course_id, started, started_at, last_lesson_id, favorite')
      .eq('user_id', user.id)
      .limit(200),
    supabase
      .from('lesson_completions')
      .select('course_id, lesson_id, completed_at')
      .eq('user_id', user.id)
      .limit(1200),
    supabase.from('lesson_notes').select('course_id, lesson_id, body').eq('user_id', user.id).limit(600),
    supabase
      .from('projects')
      .select('id, course_id, origin, status, tone, title, description, problem, skills, tools, steps, result, links, started_at, completed_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('skills')
      .select('id, name, type, in_cv, note, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(350),
  ])

  const failed = [progress, completions, notes, projects, skills].find((r) => r.error)
  if (failed) {
    console.error('Falha ao carregar dados do aluno', { userId: user.id, code: failed.error?.code })
    throw new Error('Não foi possível carregar seus dados agora.')
  }

  return stateFromRows(
    {
      profile,
      email: user.email,
      role: account.role,
      progress: (progress.data ?? []) as CourseProgressRow[],
      completions: (completions.data ?? []) as LessonCompletionRow[],
      notes: (notes.data ?? []) as LessonNoteRow[],
      projects: (projects.data ?? []) as ProjectRow[],
      skills: (skills.data ?? []) as SkillRow[],
    },
    catalog,
  )
}

/** Usado nas páginas do app: quem ainda não respondeu o primeiro acesso vai para lá. */
export async function requireOnboarded() {
  const { profile } = await getProfile()
  if (!profile.onboarded) redirect('/primeiro-acesso')
  return null
}

/** Usado no primeiro acesso: quem já respondeu vai para o início. */
export async function redirectIfOnboarded() {
  const { profile } = await getProfile()
  if (profile.onboarded) redirect('/inicio')
  return null
}
