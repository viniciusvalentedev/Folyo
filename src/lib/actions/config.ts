'use server'

import { updateTag } from 'next/cache'
import { z } from 'zod'
import { configSchema } from '@/lib/app-config'
import { CONFIG_TAG } from '@/lib/data/config'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY, type AdminFailure } from './admin-shared'
import { actionContext, EXPIRED, INVALID } from './shared'

/**
 * Salvar as configurações da plataforma (rodam SÓ no servidor).
 * O formato é conferido aqui (zod) e de novo no banco (`admin_save_config`), que também
 * confere o papel (administrador ou acima), recusa gravar por cima de uma alteração
 * de outra pessoa e registra no histórico.
 */

const saveSchema = z.object({
  config: configSchema,
  /** "updatedAt" que a tela leu; o banco recusa se outra pessoa salvou depois. */
  expected: z.string().max(64).nullable(),
  force: z.boolean().default(false),
})

export type SaveConfigResult = { ok: true; updatedAt: string | null } | AdminFailure

export async function saveConfigAction(input: unknown): Promise<SaveConfigResult> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return TOO_MANY

  const { data, error } = await ctx.supabase.rpc('admin_save_config', {
    p_config: parsed.data.config,
    p_expected: parsed.data.force ? null : parsed.data.expected,
    p_force: parsed.data.force,
  })
  if (error) return fromDb('admin_save_config', ctx.user.id, error)
  // O nome, a frase da entrada etc. ficam em cache: o novo valor vale já na próxima visita.
  updateTag(CONFIG_TAG)
  const saved = z.object({ updatedAt: z.string().max(64).optional() }).safeParse(data)
  return { ok: true, updatedAt: saved.success ? (saved.data.updatedAt ?? null) : null }
}
