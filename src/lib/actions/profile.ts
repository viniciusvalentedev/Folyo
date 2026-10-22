'use server'

import { getCatalog } from '@/lib/data/catalog'
import { isKnownStage } from '@/lib/onboarding'
import { goalsSchema, onboardingSchema } from '@/lib/validation'
import { actionContext, dbFailure, EXPIRED, INVALID, OK, type ActionResult } from './shared'

/**
 * Ações do primeiro acesso e dos objetivos de carreira (rodam SÓ no servidor).
 *
 * Em todas: 1) valida os dados de novo; 2) confere quem está logado;
 * 3) grava só a linha do próprio aluno (o banco confere de novo com RLS).
 * Nome, currículo e configurações ficam em ./student.ts.
 */

type ProfilePatch = Partial<{
  stage: string
  goal_primary: string
  goals_secondary: string[]
  weekly_goal: number
  onboarded: boolean
}>

async function updateOwnProfile(patch: ProfilePatch): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { data, error } = await ctx.supabase.from('profiles').update(patch).eq('id', ctx.user.id).select('id')
  if (error || !data || data.length !== 1) return dbFailure('profiles.goals', error)
  return OK
}

async function knownGoalIds() {
  const { goals } = await getCatalog()
  return new Set(goals.map((g) => g.id))
}

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success || !isKnownStage(parsed.data.stage) || !(await knownGoalIds()).has(parsed.data.goal)) return INVALID
  return updateOwnProfile({
    goal_primary: parsed.data.goal,
    stage: parsed.data.stage,
    weekly_goal: parsed.data.weekly,
    onboarded: true,
  })
}

export async function saveGoalsAction(input: unknown): Promise<ActionResult> {
  const parsed = goalsSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const ids = await knownGoalIds()
  const { primary, secondary } = parsed.data
  if (!ids.has(primary) || secondary.some((g) => !ids.has(g) || g === primary)) return INVALID
  return updateOwnProfile({ goal_primary: primary, goals_secondary: [...new Set(secondary)] })
}
