import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseEnv } from '@/lib/supabase/config'

/**
 * Confere a SENHA ATUAL de quem está logado, antes de uma ação sem volta (hoje: excluir a conta). Só servidor.
 *
 * Quem confere é o próprio Supabase Auth: fazemos um login com o e-mail DA SESSÃO (nunca um e-mail vindo do navegador)
 * num cliente separado, que não lê nem grava cookie nenhum. Assim a sessão do navegador não muda. A sessão criada só para
 * a conferência é encerrada na hora.
 *
 * Usa a publishable key (a mesma do resto do site), nunca a chave secreta. O CAPTCHA, quando ligado no Supabase, vale
 * aqui também (é um login), por isso o comprovante do Turnstile vem junto. A senha nunca é registrada em log.
 */

export type PasswordCheck = 'ok' | 'senha_errada' | 'captcha' | 'limite' | 'falha'

export async function verifyCurrentPassword(input: {
  userId: string
  email: string
  password: string
  captchaToken?: string
  clientIp?: string | null
}): Promise<PasswordCheck> {
  if (!input.email) return 'falha'
  const { url, key } = supabaseEnv()
  const verifier = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Repassa o IP real (vindo da Vercel), para o CAPTCHA e os limites do Supabase olharem para a pessoa, não para o servidor.
    ...(input.clientIp ? { global: { headers: { 'X-Forwarded-For': input.clientIp } } } : {}),
  })

  const { data, error } = await verifier.auth.signInWithPassword({
    email: input.email,
    password: input.password,
    options: { captchaToken: input.captchaToken },
  })
  if (error) {
    if (error.code === 'invalid_credentials') return 'senha_errada'
    if (error.code === 'captcha_failed') return 'captcha'
    if (error.code === 'over_request_rate_limit') return 'limite'
    console.error('Falha ao conferir a senha atual', { code: error.code, status: error.status })
    return 'falha'
  }

  // A sessão de conferência não serve para mais nada: encerra já (só ela; a do navegador continua).
  const { error: outError } = await verifier.auth.signOut({ scope: 'local' })
  if (outError) console.error('Falha ao encerrar a sessão de conferência', { code: outError.code })

  // Conferência extra: o login tem que ser da MESMA conta da sessão.
  return data.user?.id === input.userId ? 'ok' : 'falha'
}
