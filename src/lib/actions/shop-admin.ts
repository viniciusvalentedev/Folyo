'use server'

import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY } from './admin-shared'
import { actionContext, EXPIRED, INVALID, OK, type ActionResult } from './shared'

/**
 * Painel: promoção de lançamento e liberação manual de cursos pagos (rodam SÓ no servidor).
 * Como as outras ações do painel, aqui só se confere o formato; quem decide se a pessoa pode
 * (administrador ou acima, com o 2º fator) é o banco, que também grava o histórico.
 */

const NOT_MIGRATED = { ok: false, error: 'Rode no Supabase o SQL do cupom de lançamento (veja supabase/README.md).' } as const

async function call(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY
  const { error } = await ctx.supabase.rpc(fn, args)
  if (!error) return OK
  if (error.code === 'PGRST202') return NOT_MIGRATED
  return fromDb(fn, ctx.user.id, error)
}

/** Liga ou desliga a promoção de lançamento (desligar encerra os pré-acessos por cupom). */
export async function setLaunchPromoAction(input: unknown): Promise<ActionResult> {
  const parsed = z.object({ active: z.boolean() }).safeParse(input)
  if (!parsed.success) return INVALID
  return call('admin_set_launch_promo', { p_active: parsed.data.active })
}

const accessSchema = z.object({ userId: z.uuid(), courseId: z.string().regex(ID_PATTERN) })

/** "Liberar acesso": o aluno passa a assistir ao curso pago, sem prazo. */
export async function grantCourseAccessAction(input: unknown): Promise<ActionResult> {
  const parsed = accessSchema.safeParse(input)
  if (!parsed.success) return INVALID
  return call('admin_grant_course_access', { p_user: parsed.data.userId, p_course: parsed.data.courseId })
}

/** "Remover acesso": tira só a liberação manual (pré-acesso de cupom continua até o fim). */
export async function revokeCourseAccessAction(input: unknown): Promise<ActionResult> {
  const parsed = accessSchema.safeParse(input)
  if (!parsed.success) return INVALID
  return call('admin_revoke_course_access', { p_user: parsed.data.userId, p_course: parsed.data.courseId })
}
