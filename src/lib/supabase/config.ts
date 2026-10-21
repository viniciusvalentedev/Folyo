import 'server-only'
import type { CookieOptions } from '@supabase/ssr'

/**
 * Configuração do Supabase (só servidor).
 *
 * As duas variáveis vêm do arquivo .env.local (no seu computador) e das
 * "Environment Variables" da Vercel. A publishable key pode ser pública: quem
 * protege os dados são as regras RLS do banco.
 *
 * A SECRET KEY não é usada aqui de propósito. Ela ignora todas as regras do
 * banco e só deve entrar no projeto quando houver uma tarefa que precise dela
 * (ex.: painel admin), sempre em arquivo de servidor.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase não configurado: preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY no .env.local (veja o .env.example).',
    )
  }
  if (isSecretKey(key)) {
    // Trava de segurança: com a chave secreta o site ignoraria todas as regras do banco (RLS).
    throw new Error(
      'A chave em NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY é uma chave SECRETA. Use a publishable key (sb_publishable_...) e troque a secreta no Supabase.',
    )
  }
  return { url, key }
}

/** Reconhece a secret key nova (sb_secret_...) e a antiga "service_role" (um JWT). */
function isSecretKey(key: string) {
  if (key.startsWith('sb_secret_')) return true
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))?.role === 'service_role'
  } catch {
    return false
  }
}

/**
 * Cookies da sessão de login.
 *
 * httpOnly: o JavaScript da página NÃO consegue ler o cookie. Assim, mesmo que
 * algum dia entre um script malicioso no site, ele não rouba a sessão. Isso só
 * é possível porque toda conversa com o Supabase acontece no servidor.
 * secure: só viaja por HTTPS (no computador, em http://localhost, fica desligado).
 * sameSite=lax: o navegador não manda o cookie em formulários vindos de outros sites.
 */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
}
