import 'server-only'
import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Verificação em duas etapas (MFA) da equipe do painel (só servidor).
 *
 * Quem decide de verdade é o banco: private.actor_rank() trata sessão sem o 2º fator como aluno
 * (veja supabase/migrations/20261026000001_mfa_painel.sql). Aqui só descobrimos em que ponto a
 * pessoa está para mostrar a tela certa (cadastrar o autenticador, digitar o código ou entrar).
 */

/** aal1 = só a senha. aal2 = senha + código do aplicativo autenticador nesta sessão. */
export type Aal = 'aal1' | 'aal2'

/** Nível da sessão atual, lido do token já conferido (assinatura). Na dúvida, aal1. */
export const getAal = cache(async (): Promise<Aal> => {
  const supabase = await createSupabaseServerClient()
  const result = await supabase.auth.getClaims().catch(() => null)
  const aal = (result?.data?.claims as { aal?: unknown } | undefined)?.aal
  return aal === 'aal2' ? 'aal2' : 'aal1'
})

export type TotpFactors = {
  /** Autenticadores já confirmados (com o primeiro código digitado). */
  verified: { id: string }[]
  /** Cadastros começados e nunca confirmados. */
  pending: { id: string }[]
}

/** Aplicativos autenticadores (TOTP) da conta logada. */
export async function getTotpFactors(): Promise<TotpFactors> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) {
    console.error('Falha ao listar autenticadores', { code: error?.code })
    throw new Error('Não foi possível carregar a verificação em duas etapas agora.')
  }
  const totp = data.all.filter((f) => f.factor_type === 'totp')
  return {
    verified: totp.filter((f) => f.status === 'verified').map((f) => ({ id: f.id })),
    pending: totp.filter((f) => f.status !== 'verified').map((f) => ({ id: f.id })),
  }
}
