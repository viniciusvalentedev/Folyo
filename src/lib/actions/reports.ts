'use server'

import { z } from 'zod'
import { isDay } from '@/lib/admin/period'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY } from './admin-shared'
import { actionContext, EXPIRED, INVALID, OK, type ActionResult } from './shared'

const schema = z.object({
  report: z.enum(['crescimento', 'matriculas', 'cursos', 'aulas', 'atividade']),
  rows: z.number().int().min(0).max(100000),
  from: z.string().refine(isDay),
  to: z.string().refine(isDay),
})

/** Registra no histórico de auditoria que alguém exportou um relatório (o arquivo é gerado no navegador). */
export async function logExportAction(input: unknown): Promise<ActionResult | { ok: false; error: string; code?: string }> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY
  const { error } = await ctx.supabase.rpc('admin_log_export', {
    p_report: parsed.data.report,
    p_rows: parsed.data.rows,
    p_from: parsed.data.from,
    p_to: parsed.data.to,
  })
  return error ? fromDb('admin_log_export', ctx.user.id, error) : OK
}
