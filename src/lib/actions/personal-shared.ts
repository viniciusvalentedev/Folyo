import 'server-only'
import type { ActionContext, ActionFailure } from './shared'
import { dbFailure, EXPIRED } from './shared'

/**
 * Peças comuns das ações do cadastro completo (celular, nascimento, gênero). Fora do arquivo 'use server' de
 * propósito (veja shared.ts). Os dados ficam em private.personal_data e só passam pelas funções do banco
 * (supabase/migrations/20261104000002_dados_do_cadastro.sql), que conferem tudo de novo.
 *
 * Nunca registre no log o conteúdo destes dados: só o código do erro.
 */

type RpcError = { code?: string; message?: string } | null

/** Traduz o erro das funções do cadastro: as mensagens FA400/FA409 do banco já são em português, para o aluno. */
export function personalFailure(where: string, error: RpcError): ActionFailure {
  if (error?.code === 'FA403') return EXPIRED
  if ((error?.code === 'FA400' || error?.code === 'FA409') && error.message) return { ok: false, error: error.message }
  return dbFailure(where, error)
}

/** Liga ou desliga as novidades pelo WhatsApp (só com o cadastro concluído; o banco confere). */
export async function setWhatsappNews(ctx: ActionContext, on: boolean): Promise<ActionFailure | null> {
  const { error } = await ctx.supabase.rpc('set_my_whatsapp_news', { p_on: on })
  return error ? personalFailure('personal.whatsapp', error) : null
}
