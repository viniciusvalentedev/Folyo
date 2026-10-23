import 'server-only'
import { getSessionUser, type SessionUser } from '@/lib/data/user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Peças comuns das Server Actions (só servidor).
 *
 * Fica FORA dos arquivos 'use server' de propósito: tudo o que é exportado de um
 * arquivo 'use server' vira um endereço que qualquer pessoa pode chamar pela
 * internet. Aqui ficam só ajudantes internos.
 */

export type ActionFailure = { ok: false; error: string }
export type ActionResult = { ok: true } | ActionFailure

export const OK = { ok: true } as const satisfies ActionResult
export const EXPIRED: ActionFailure = { ok: false, error: 'Sua sessão expirou. Entre de novo para continuar.' }
export const INVALID: ActionFailure = { ok: false, error: 'Não deu para salvar: dados inválidos.' }
export const FAILED: ActionFailure = { ok: false, error: 'Não foi possível salvar agora. Tente de novo em instantes.' }
export const RATE_LIMITED: ActionFailure = {
  ok: false,
  error: 'Muitas alterações seguidas. Espere um minuto: o que você mudou agora pode não ter sido salvo.',
}
export const LIMIT: ActionFailure = { ok: false, error: 'Você chegou ao limite de itens desta lista. Apague alguns para criar novos.' }

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>
export type ActionContext = { user: SessionUser; supabase: Supabase }

/** Confere quem está logado (assinatura do token). Sem login, a ação não faz nada. */
export async function actionContext(): Promise<ActionContext | null> {
  const user = await getSessionUser()
  if (!user) return null
  return { user, supabase: await createSupabaseServerClient() }
}

type DbError = { code?: string; message?: string } | null

/** Registra só o código do erro (nunca o conteúdo do aluno) e devolve uma mensagem amigável. */
export function dbFailure(where: string, error: DbError): ActionFailure {
  // FY429 = limite de alterações por minuto do banco (etapa 3). Não é falha do site.
  if (error?.code === 'FY429') return RATE_LIMITED
  console.error('Falha ao salvar', { where, code: error?.code })
  if (error?.code === '23514' && error.message?.includes('Limite de')) return LIMIT
  return FAILED
}

/**
 * Atualiza a linha do aluno; se ela ainda não existe, cria.
 * (Não usamos "upsert" do PostgREST porque ele tentaria alterar colunas que o
 * aluno não tem permissão de mudar, como o id e o curso.)
 */
export async function updateOrInsert(
  ctx: ActionContext,
  table: string,
  match: Record<string, string>,
  changes: Record<string, unknown>,
  insertExtra: Record<string, unknown> = {},
): Promise<ActionResult> {
  const update = () => {
    let query = ctx.supabase.from(table).update(changes).eq('user_id', ctx.user.id)
    for (const [column, value] of Object.entries(match)) query = query.eq(column, value)
    return query.select(Object.keys(match)[0])
  }

  const first = await update()
  if (first.error) return dbFailure(table + '.update', first.error)
  if (first.data.length > 0) return OK

  const inserted = await ctx.supabase.from(table).insert({ ...match, ...insertExtra, ...changes })
  if (!inserted.error) return OK
  if (inserted.error.code === '23505') {
    // Outro pedido criou a linha ao mesmo tempo: tenta atualizar de novo.
    const second = await update()
    if (!second.error && second.data.length > 0) return OK
  }
  return dbFailure(table + '.insert', inserted.error)
}
