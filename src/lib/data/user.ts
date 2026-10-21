import 'server-only'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { stateFromProfile, type ProfileRow } from '@/lib/domain/empty-state'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { UserState } from '@/lib/types'

/**
 * Camada de acesso a dados do ALUNO LOGADO (DAL).
 *
 * Toda leitura de dados do aluno passa por aqui, e aqui a sessão é conferida
 * de verdade (assinatura do token), mesmo que o proxy já tenha olhado antes.
 * O banco ainda aplica o RLS: mesmo com um bug aqui, ninguém lê dados de outra pessoa.
 *
 * `cache` evita repetir a mesma consulta várias vezes na mesma página.
 */

export type SessionUser = { id: string; email: string }

/** Aluno logado ou null. Nunca use getSession() no servidor para isso (o cookie pode ser falsificado). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
})

/** Aluno logado; se não houver, manda para /entrar. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/entrar')
  return user
}

const PROFILE_COLUMNS = 'name, stage, goal_primary, goals_secondary, weekly_goal, onboarded, created_at'

/** Perfil do aluno logado (lido com as regras RLS: só a própria linha). */
export const getProfile = cache(async (): Promise<{ user: SessionUser; profile: ProfileRow }> => {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).single()
  if (error || !data) {
    // Sem detalhes técnicos para quem está usando; o erro completo fica no log do servidor.
    console.error('Perfil não encontrado', { userId: user.id, code: error?.code })
    throw new Error('Não encontramos o seu perfil.')
  }
  return { user, profile: data as ProfileRow }
})

/** Estado inicial da área do aluno (vai para o navegador já filtrado). */
export async function getCurrentUserState(): Promise<UserState> {
  const { user, profile } = await getProfile()
  return stateFromProfile(profile, user.email)
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
