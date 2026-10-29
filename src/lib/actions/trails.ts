'use server'

import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import { trailSchema } from '@/lib/admin/catalog-schema'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY } from './admin-shared'
import type { DoneResult, SaveResult } from './catalog'
import { actionContext, EXPIRED, INVALID } from './shared'

/**
 * Ações das trilhas de carreira do painel (rodam SÓ no servidor).
 *
 * Mesma ideia das categorias (catalog.ts): aqui só se valida o formato e se repassa para as funções
 * do banco (admin_save_trail, admin_delete_trail, admin_reorder_trails), que conferem o papel de quem
 * chamou (editor ou acima), as regras e gravam o histórico.
 */

const idSchema = z.string().regex(ID_PATTERN)

async function gate() {
  const ctx = await actionContext()
  if (!ctx) return { fail: EXPIRED }
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return { fail: TOO_MANY }
  return { ctx }
}

/** O SQL das trilhas ainda não foi rodado: as funções não existem (PGRST202). */
const SQL_MISSING = { ok: false, error: 'Rode no Supabase o SQL das trilhas (veja supabase/README.md) para poder editar as trilhas.' } as const

const saveSchema = z.object({ trail: trailSchema, isNew: z.boolean() })

export async function saveTrailAction(input: unknown): Promise<SaveResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { trail, isNew } = parsed.data
  // Trilha nova com endereço já usado: tenta "nome-2", "nome-3"... (até 6 tentativas).
  for (let attempt = 1; attempt <= 6; attempt++) {
    const id = attempt === 1 ? trail.id : `${trail.id.slice(0, 36).replace(/-+$/, '')}-${attempt}`
    const { data, error } = await ctx.supabase.rpc('admin_save_trail', { p_trail: { ...trail, id }, p_is_new: isNew })
    if (error) {
      if (error.code === 'PGRST202') return SQL_MISSING
      if (isNew && error.code === 'FA410' && attempt < 6) continue
      return fromDb('admin_save_trail', ctx.user.id, error)
    }
    const saved = z.object({ id: idSchema }).safeParse(data)
    return saved.success ? { ok: true, id: saved.data.id, updatedAt: null } : { ok: false, error: 'Recarregue a página.' }
  }
  return { ok: false, error: 'Não foi possível criar um endereço livre para a trilha. Mude o nome.' }
}

/** Exclui uma trilha (o banco recusa se algum aluno a escolheu; nesse caso, desative). */
export async function deleteTrailAction(input: unknown): Promise<DoneResult> {
  const parsed = z.object({ id: idSchema }).safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_delete_trail', { p_id: parsed.data.id })
  if (error?.code === 'PGRST202') return SQL_MISSING
  return error ? fromDb('admin_delete_trail', ctx.user.id, error) : { ok: true }
}

/** Grava a ordem das trilhas (lista completa de ids na nova ordem). */
export async function reorderTrailsAction(input: unknown): Promise<DoneResult> {
  const parsed = z.object({ ids: z.array(idSchema).min(1).max(100) }).safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_reorder_trails', { p_ids: parsed.data.ids })
  if (error?.code === 'PGRST202') return SQL_MISSING
  return error ? fromDb('admin_reorder_trails', ctx.user.id, error) : { ok: true }
}
