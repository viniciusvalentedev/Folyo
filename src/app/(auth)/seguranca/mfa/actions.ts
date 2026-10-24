'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { safeNext } from '@/lib/auth/redirects'
import { getTotpFactors } from '@/lib/data/mfa'
import { getAccount, getSessionUser } from '@/lib/data/user'
import { AUTH_LIMITS, allowShared, hitShared, limitedShared, resetShared } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { fieldErrors, mfaCodeSchema } from '@/lib/validation'

/**
 * Verificação em duas etapas da equipe (rodam SÓ no servidor).
 *
 * O segundo fator é um aplicativo autenticador (TOTP: Google Authenticator, Microsoft
 * Authenticator, 1Password, Authy...). Depois de digitar o código certo, o Supabase troca a
 * sessão por uma de nível aal2, e é isso que o banco exige para tratar a conta como equipe
 * (private.actor_rank). Nada aqui libera o painel sozinho: quem decide é o banco.
 */

export type MfaFormState = {
  errors?: Record<string, string>
  message?: string
  /** Autenticador novo, pronto para ler o QR code (o código só vale depois de confirmado). */
  enroll?: { factorId: string; qr: string; secret: string }
}

const GENERIC = 'Não foi possível concluir agora. Tente de novo em alguns minutos.'
const TOO_MANY = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'

/** Só a equipe usa esta tela. Quem não está logado vai entrar; aluno e conta suspensa vão para as páginas deles. */
async function staffUser() {
  const user = await getSessionUser()
  if (!user) redirect('/entrar')
  const account = await getAccount()
  if (account.suspended) redirect('/conta-suspensa')
  if (account.role === 'aluno') redirect('/inicio')
  return user
}

/** Começa o cadastro do aplicativo autenticador e devolve o QR code. */
export async function startEnrollAction(): Promise<MfaFormState> {
  const user = await staffUser()
  if (!(await allowShared('mfa-enroll:' + user.id, AUTH_LIMITS.mfaEnroll))) return { message: TOO_MANY }

  const factors = await getTotpFactors()
  // Já existe um autenticador confirmado: cadastrar outro por aqui deixaria quem só tem a senha
  // trocar o segundo fator. Para trocar de aparelho, a remoção é feita pelo proprietário (supabase/README.md).
  if (factors.verified.length > 0) {
    return { message: 'Esta conta já tem um aplicativo autenticador. Recarregue a página e digite o código dele.' }
  }

  const supabase = await createSupabaseServerClient()
  // Cadastros antigos que ninguém terminou: saem do caminho (senão o Supabase recusa o nome repetido).
  for (const old of factors.pending) await supabase.auth.mfa.unenroll({ factorId: old.id })

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    issuer: 'Folyo',
    friendlyName: 'Aplicativo ' + crypto.randomUUID().slice(0, 8),
  })
  if (error || !data) {
    console.error('Falha ao cadastrar autenticador', { code: error?.code })
    return { message: error?.code === 'over_request_rate_limit' ? TOO_MANY : GENERIC }
  }
  // O QR code vem do Supabase como imagem SVG em "data:". Qualquer outra coisa não vai para a tela.
  if (!data.totp.qr_code.startsWith('data:image/svg+xml')) {
    console.error('QR code em formato inesperado')
    return { message: GENERIC }
  }
  return { enroll: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } }
}

/** Confere o código de 6 números. Certo: a sessão passa a aal2 e a pessoa segue para o destino. */
export async function verifyMfaAction(_prev: MfaFormState, formData: FormData): Promise<MfaFormState> {
  const user = await staffUser()
  const parsed = mfaCodeSchema.safeParse({ code: formData.get('code') })
  if (!parsed.success) return { errors: fieldErrors(parsed.error) }

  const failures = 'mfa-fail:' + user.id
  if (await limitedShared(failures, AUTH_LIMITS.mfaFailures)) return { message: TOO_MANY }

  // Quem vale é o que a conta tem de verdade, não o que veio no formulário: com autenticador
  // confirmado, é ele; senão, só um cadastro em andamento DESTA conta.
  const factors = await getTotpFactors()
  const posted = z.uuid().safeParse(formData.get('factorId'))
  const factorId =
    factors.verified[0]?.id ?? factors.pending.find((f) => posted.success && f.id === posted.data)?.id
  if (!factorId) return { message: 'Não encontramos o seu autenticador. Recarregue a página e comece de novo.' }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: parsed.data.code })
  if (error) {
    switch (error.code) {
      case 'mfa_verification_failed':
      case 'mfa_verification_rejected':
        await hitShared(failures, AUTH_LIMITS.mfaFailures)
        return { errors: { code: 'Código incorreto. Confira o aplicativo e tente de novo.' } }
      case 'mfa_challenge_expired':
        return { errors: { code: 'Esse código venceu. Digite o próximo que aparecer no aplicativo.' } }
      case 'over_request_rate_limit':
        return { message: TOO_MANY }
      default:
        console.error('Erro ao verificar o autenticador', { code: error.code, status: error.status })
        return { message: GENERIC }
    }
  }
  await resetShared(failures, AUTH_LIMITS.mfaFailures)

  redirect(safeNext(formData.get('next'), '/admin'))
}
