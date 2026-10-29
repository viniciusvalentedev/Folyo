'use server'

import { getCatalog } from '@/lib/data/catalog'
import { computeOnboarding } from '@/lib/trails'
import { goalsPatchSchema, onboardingSchema } from '@/lib/validation'
import { actionContext, dbFailure, EXPIRED, INVALID, OK, type ActionResult } from './shared'

/**
 * Ações do primeiro acesso e dos objetivos (rodam SÓ no servidor).
 *
 * Em todas: 1) valida os dados de novo (só ids das listas de src/lib/trails.ts e das trilhas do painel);
 * 2) confere quem está logado; 3) grava só a linha do próprio aluno (o banco confere
 * de novo com RLS). Nome, currículo e configurações ficam em ./student.ts.
 */

async function updateOwnProfile(patch: Record<string, unknown>, where: string): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { data, error } = await ctx.supabase.from('profiles').update(patch).eq('id', ctx.user.id).select('id')
  if (error || !data || data.length !== 1) return dbFailure(where, error)
  return OK
}

/**
 * Primeiro acesso: momento de vida, áreas de interesse e o que a pessoa quer conquistar.
 * O servidor calcula o resto (trilha, skills, objetivo) com a mesma função da tela.
 */
export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const result = computeOnboarding(parsed.data, (await getCatalog()).trails)
  if (!result) return INVALID

  const saved = await updateOwnProfile(
    {
      stage: result.stage,
      interests: result.interests,
      exploring: result.exploring,
      goals_wants: result.wants,
      goals_skills: result.skills,
      goal_primary: result.primary,
      goals_secondary: [],
      goals_text: result.text,
      onboarded: true,
    },
    'profiles.onboarding',
  )
  if (!saved.ok) return saved

  // A "headline" (frase abaixo do nome) só é preenchida se a pessoa ainda não escreveu a dela.
  const ctx = await actionContext()
  if (!ctx) return OK
  const { error } = await ctx.supabase
    .from('profiles')
    .update({ headline: result.headline })
    .eq('id', ctx.user.id)
    .eq('headline', '')
  if (error) console.error('Falha ao salvar a frase do perfil', { code: error.code })
  return OK
}

/** Objetivos: trilha principal e acompanhadas, texto, skills desejadas e metas. Só o que mudou. */
export async function saveGoalsAction(input: unknown): Promise<ActionResult> {
  const parsed = goalsPatchSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const g = parsed.data
  // Só trilhas que existem (cadastradas no painel).
  if (g.primary || g.secondary?.length) {
    const known = new Set((await getCatalog()).trails.map((t) => t.id))
    if (![g.primary, ...(g.secondary ?? [])].every((id) => !id || known.has(id))) return INVALID
  }
  const secondary = g.secondary && [...new Set(g.secondary)].filter((id) => id !== (g.primary ?? null))
  const patch: Record<string, unknown> = {}
  if (g.primary !== undefined) patch.goal_primary = g.primary
  if (secondary !== undefined) patch.goals_secondary = secondary
  if (g.text !== undefined) patch.goals_text = g.text.replace(/\s+/g, ' ').trim()
  if (g.skills !== undefined) patch.goals_skills = [...new Set(g.skills)]
  if (g.wants !== undefined) patch.goals_wants = [...new Set(g.wants)]
  return updateOwnProfile(patch, 'profiles.goals')
}
