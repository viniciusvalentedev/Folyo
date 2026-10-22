'use server'

import { z } from 'zod'
import { ROLE_KEYS, type Role } from '@/lib/admin/roles'
import { allow } from '@/lib/security/rate-limit'
import { actionContext, EXPIRED, FAILED, INVALID, OK, type ActionResult } from './shared'

/**
 * Ações do painel admin (rodam SÓ no servidor).
 *
 * Como toda Server Action, cada função aqui é uma porta aberta para a internet:
 * qualquer pessoa logada pode chamar. Por isso elas NÃO decidem quem pode o quê:
 * só validam os dados e repassam para as funções do banco (admin_*), que conferem
 * o papel de quem chamou e as regras de hierarquia. Aluno que chamar recebe
 * "Seu papel não dá acesso a esta ação."
 */

/** Mensagens que o próprio banco escreve (códigos FA...) podem ir para a tela. */
function fromDb(where: string, userId: string, error: { code?: string; message?: string }): ActionResult {
  if (error.code === 'FY429') return TOO_MANY
  if (error.code && /^FA[0-9]{3}$/.test(error.code) && error.message) {
    // Tentativa barrada pelo banco: fica no log do servidor (Vercel → Logs) para dar para investigar.
    if (error.code === 'FA403') console.warn('Painel: ação negada', { where, userId })
    return { ok: false, error: error.message }
  }
  console.error('Falha no painel', { where, code: error.code })
  return FAILED
}

const TOO_MANY: ActionResult = { ok: false, error: 'Muitas ações seguidas. Espere um minuto e tente de novo.' }
const ADMIN_RATE = { max: 60, windowMs: 60_000 }

const setRoleSchema = z.object({ userId: z.uuid(), role: z.enum(ROLE_KEYS as [Role, ...Role[]]) })

export async function setRoleAction(input: unknown): Promise<ActionResult> {
  const parsed = setRoleSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY
  const { error } = await ctx.supabase.rpc('admin_set_role', { p_user: parsed.data.userId, p_role: parsed.data.role })
  return error ? fromDb('admin_set_role', ctx.user.id, error) : OK
}

const suspendSchema = z.object({
  userId: z.uuid(),
  suspended: z.boolean(),
  reason: z.string().max(500).default(''),
})

export async function setSuspendedAction(input: unknown): Promise<ActionResult> {
  const parsed = suspendSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY
  const { error } = await ctx.supabase.rpc('admin_set_suspended', {
    p_user: parsed.data.userId,
    p_suspended: parsed.data.suspended,
    p_reason: parsed.data.reason.trim(),
  })
  return error ? fromDb('admin_set_suspended', ctx.user.id, error) : OK
}

export type Candidate = { id: string; name: string; email: string }
const searchSchema = z.string().trim().min(2).max(100)
const candidateSchema = z.object({ rows: z.array(z.object({ id: z.uuid(), name: z.string().max(80), email: z.string().max(320) })).max(25) })

/** Busca alunos (sem papel) para "Dar acesso ao painel". O banco só responde para administradores. */
export async function searchCandidatesAction(query: unknown): Promise<{ ok: true; rows: Candidate[] } | { ok: false; error: string }> {
  const parsed = searchSchema.safeParse(query)
  if (!parsed.success) return { ok: true, rows: [] }
  const ctx = await actionContext()
  if (!ctx) return { ok: false, error: (EXPIRED as { error: string }).error }
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY as { ok: false; error: string }
  const { data, error } = await ctx.supabase.rpc('admin_list_users', {
    p_search: parsed.data,
    p_status: 'ativo',
    p_role: 'aluno',
    p_since: null,
    p_sort: 'name',
    p_page: 0,
  })
  if (error) return fromDb('admin_list_users', ctx.user.id, error) as { ok: false; error: string }
  const rows = candidateSchema.safeParse(data)
  return rows.success ? { ok: true, rows: rows.data.rows.slice(0, 6) } : FAILED as { ok: false; error: string }
}
