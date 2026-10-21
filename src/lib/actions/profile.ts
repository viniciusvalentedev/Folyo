'use server'

import { getCatalog } from '@/lib/data/catalog'
import { getSessionUser } from '@/lib/data/user'
import { isKnownStage } from '@/lib/onboarding'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { goalsSchema, onboardingSchema, personNameSchema, weeklyGoalSchema } from '@/lib/validation'

/**
 * Ações que salvam o perfil do aluno no banco (rodam SÓ no servidor).
 *
 * Em todas: 1) confere quem está logado; 2) valida os dados de novo;
 * 3) grava só a linha do próprio aluno (o banco confere de novo com RLS).
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

const EXPIRED: ActionResult = { ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' }
const INVALID: ActionResult = { ok: false, error: 'Não deu para salvar: dados inválidos.' }
const FAILED: ActionResult = { ok: false, error: 'Não foi possível salvar agora. Tente de novo em instantes.' }

type ProfilePatch = Partial<{
  name: string
  stage: string
  goal_primary: string
  goals_secondary: string[]
  weekly_goal: number
  onboarded: boolean
}>

async function updateOwnProfile(patch: ProfilePatch): Promise<ActionResult> {
  const user = await getSessionUser()
  if (!user) return EXPIRED
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('id')
  if (error || !data || data.length !== 1) {
    console.error('Falha ao salvar perfil', { code: error?.code })
    return FAILED
  }
  return { ok: true }
}

async function knownGoalIds() {
  const { goals } = await getCatalog()
  return new Set(goals.map((g) => g.id))
}

export async function completeOnboardingAction(input: { goal: string; stage: string; weekly: number }): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success || !isKnownStage(parsed.data.stage) || !(await knownGoalIds()).has(parsed.data.goal)) return INVALID
  return updateOwnProfile({
    goal_primary: parsed.data.goal,
    stage: parsed.data.stage,
    weekly_goal: parsed.data.weekly,
    onboarded: true,
  })
}

export async function saveNameAction(name: string): Promise<ActionResult> {
  const parsed = personNameSchema.safeParse(name)
  if (!parsed.success) return INVALID
  return updateOwnProfile({ name: parsed.data })
}

export async function saveGoalsAction(input: { primary: string; secondary: string[] }): Promise<ActionResult> {
  const parsed = goalsSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const ids = await knownGoalIds()
  const { primary, secondary } = parsed.data
  if (!ids.has(primary) || secondary.some((g) => !ids.has(g) || g === primary)) return INVALID
  return updateOwnProfile({ goal_primary: primary, goals_secondary: [...new Set(secondary)] })
}

export async function saveWeeklyGoalAction(weekly: number): Promise<ActionResult> {
  const parsed = weeklyGoalSchema.safeParse(weekly)
  if (!parsed.success) return INVALID
  return updateOwnProfile({ weekly_goal: parsed.data })
}
