'use server'

import { normalizeSlug, slugProblem, SLUG_ERRORS } from '@/lib/public-profile'
import { AUTH_LIMITS, allowShared } from '@/lib/security/rate-limit'
import { actionContext, EXPIRED, FAILED, INVALID, type ActionFailure } from './shared'

/**
 * Endereço do perfil público (/u/<endereço>), roda SÓ no servidor.
 *
 * O formato é conferido aqui (resposta rápida), mas quem decide de verdade é a função `set_my_slug`
 * do banco: ela repete o formato, bloqueia os nomes reservados, impede dois perfis com o mesmo
 * endereço e segura trocas seguidas. O id da conta vem do token, nunca do navegador. Nenhuma outra
 * ação consegue gravar a coluna `slug` (o banco recusa).
 */

export type SlugResult = { ok: true; slug: string } | ActionFailure

export async function claimPublicSlugAction(input: unknown): Promise<SlugResult> {
  if (typeof input !== 'string' || input.length > 200) return INVALID
  const slug = normalizeSlug(input)
  const problem = slugProblem(slug)
  if (problem) return { ok: false, error: problem }

  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!(await allowShared('slug:' + ctx.user.id, AUTH_LIMITS.slugChange))) {
    return { ok: false, error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  const { data, error } = await ctx.supabase.rpc('set_my_slug', { p_slug: slug })
  if (error || typeof data !== 'string') {
    // PGRST202 = a função ainda não existe (SQL do perfil público não rodado).
    console.error('Falha ao salvar o endereço do perfil', { code: error?.code })
    return FAILED
  }
  if (data === 'ok') return { ok: true, slug }
  return { ok: false, error: SLUG_ERRORS[data] ?? FAILED.error }
}
