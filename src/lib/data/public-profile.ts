import 'server-only'
import { parsePublicProfile, SLUG_MAX, SLUG_MIN, SLUG_PATTERN, type PortfolioData } from '@/lib/public-profile'
import { supabaseEnv } from '@/lib/supabase/config'

/**
 * Leitura do perfil público (visitante, SEM login).
 *
 * Chama a função `get_public_profile` do banco com a chave pública e sem cookies: o visitante nunca
 * usa a sessão de ninguém. A função só devolve alguma coisa se a pessoa ligou "Perfil público" e
 * escolheu um endereço, e devolve só os campos que a página mostra (nunca telefone, e-mail de login,
 * anotações, progresso aula a aula ou trabalhos privados). Perfil privado, endereço que não existe e
 * conta suspensa têm a MESMA resposta (null): ninguém descobre quem tem conta.
 *
 * Não usa cache: quando a pessoa desliga o perfil, a página fecha na hora.
 */

export type PublicProfileResult =
  | { ok: true; data: PortfolioData }
  | { ok: false; reason: 'notfound' | 'unavailable' }

const NOT_FOUND = { ok: false, reason: 'notfound' } as const
const UNAVAILABLE = { ok: false, reason: 'unavailable' } as const

/** Endereço digitado na URL: minúsculas e dentro do formato, ou null (nem chega ao banco). */
export function cleanSlug(raw: string): string | null {
  const slug = raw.trim().toLowerCase()
  return slug.length >= SLUG_MIN && slug.length <= SLUG_MAX && SLUG_PATTERN.test(slug) ? slug : null
}

export async function getPublicProfile(rawSlug: string): Promise<PublicProfileResult> {
  const slug = cleanSlug(rawSlug)
  if (!slug) return NOT_FOUND
  try {
    const { url, key } = supabaseEnv()
    const res = await fetch(`${url}/rest/v1/rpc/get_public_profile`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) {
      // 404 com PGRST202 = o SQL do perfil público ainda não foi rodado no Supabase.
      console.error('Falha ao ler o perfil público', { status: res.status })
      return UNAVAILABLE
    }
    const json: unknown = await res.json()
    if (json === null) return NOT_FOUND
    const data = parsePublicProfile(json)
    if (!data) {
      console.error('Resposta inesperada do banco', { fn: 'get_public_profile' })
      return UNAVAILABLE
    }
    return { ok: true, data }
  } catch {
    return UNAVAILABLE
  }
}
