'use server'

import { redirect } from 'next/navigation'
import { getAccount } from '@/lib/data/user'
import { AUTH_LIMITS, allowShared } from '@/lib/security/rate-limit'
import { deleteAccountSchema } from '@/lib/validation'
import { actionContext, EXPIRED, type ActionContext, type ActionFailure } from './shared'

/**
 * Direitos do titular (LGPD, art. 18), rodam SÓ no servidor.
 *
 * - Baixar os meus dados: a função `export_my_data` do banco devolve tudo da PRÓPRIA conta
 *   (o id vem do token, nunca do navegador).
 * - Excluir a minha conta: apaga primeiro os PDFs do Storage (o banco não consegue) e depois
 *   chama `delete_my_account`, que remove a conta e, em cascata, todo o resto.
 *
 * Detalhes e o que fica de fora: supabase/migrations/20261027000001_lgpd_conta.sql.
 */

export type ExportResult = { ok: true; filename: string; json: string } | ActionFailure

const EXPORT_FAILED: ActionFailure = {
  ok: false,
  error: 'Não foi possível gerar o arquivo agora. Tente de novo em instantes.',
}
const DELETE_FAILED: ActionFailure = {
  ok: false,
  error: 'Não foi possível excluir a conta agora. Tente de novo em instantes ou fale com o suporte.',
}

/** Devolve os dados da conta como texto JSON; o navegador transforma em arquivo para baixar. */
export async function exportMyDataAction(): Promise<ExportResult> {
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!(await allowShared('account-export:' + ctx.user.id, AUTH_LIMITS.accountExport))) {
    return { ok: false, error: 'Você já pediu o arquivo várias vezes. Espere alguns minutos e tente de novo.' }
  }

  const { data, error } = await ctx.supabase.rpc('export_my_data')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    // PGRST202 = a função ainda não existe (SQL da LGPD não rodado).
    console.error('Falha ao exportar os dados da conta', { code: error?.code })
    return EXPORT_FAILED
  }
  const day = new Date().toISOString().slice(0, 10)
  return { ok: true, filename: `folyo-meus-dados-${day}.json`, json: JSON.stringify(data, null, 2) }
}

/**
 * Apaga todos os PDFs da pasta da própria conta (inclusive envios que nunca foram confirmados).
 * Devolve false se sobrar algum: nesse caso a conta NÃO é excluída, para não deixar arquivo órfão.
 */
async function removeAllPdfs({ supabase, user }: ActionContext): Promise<boolean> {
  const bucket = supabase.storage.from('student-works')
  // O limite é de 60 arquivos por conta; 10 voltas de 100 é folga de sobra.
  for (let round = 0; round < 10; round++) {
    const { data, error } = await bucket.list(user.id, { limit: 100 })
    if (error) return false
    // Itens sem "id" são pastas; só há arquivos (PDF) nesta pasta.
    const files = (data ?? []).filter((item) => item.id)
    if (files.length === 0) return true
    const { error: removeError } = await bucket.remove(files.map((f) => `${user.id}/${f.name}`))
    if (removeError) return false
  }
  return false
}

/** Exclui a conta de quem está logado. Se der certo, a pessoa sai e vai para a tela de entrada. */
export async function deleteMyAccountAction(input: unknown): Promise<ActionFailure> {
  const parsed = deleteAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Digite a palavra EXCLUIR para confirmar.' }

  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  if (!(await allowShared('account-delete:' + ctx.user.id, AUTH_LIMITS.accountDelete))) {
    return { ok: false, error: 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' }
  }

  // Proprietário precisa passar a função adiante antes: o banco também recusa a saída do último
  // proprietário ativo, mas aqui isso evita apagar os PDFs de uma conta que não poderá ser excluída.
  const account = await getAccount()
  if (account.role === 'proprietario') {
    return {
      ok: false,
      error: 'Esta conta é de proprietário. Peça a outro proprietário para mudar a sua função no painel e tente de novo.',
    }
  }

  if (!(await removeAllPdfs(ctx))) {
    console.error('Falha ao apagar os PDFs da conta antes da exclusão')
    return DELETE_FAILED
  }

  const { error } = await ctx.supabase.rpc('delete_my_account')
  if (error) {
    if (error.code === 'FA403') return EXPIRED
    if (error.code === 'FA409') {
      return { ok: false, error: 'É preciso manter pelo menos um proprietário ativo. Peça a outro proprietário para ajudar.' }
    }
    console.error('Falha ao excluir a conta', { code: error.code })
    return DELETE_FAILED
  }

  // A conta já não existe; isto só limpa o cookie de login deste aparelho.
  await ctx.supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
  redirect('/entrar?conta=excluida')
}
