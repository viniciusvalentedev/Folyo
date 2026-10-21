import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { HOME_PATH, isGuestOnlyPath, isPublicPath } from '@/lib/auth/redirects'
import { authCookieOptions, supabaseEnv } from '@/lib/supabase/config'

/**
 * Proxy: roda no servidor ANTES de cada página.
 *
 * 1. Renova a sessão de login quando ela está para vencer (e grava o cookie novo).
 * 2. Quem não está logado e tenta abrir uma página da área do aluno vai para /entrar.
 * 3. Quem já está logado e abre /entrar vai direto para o início.
 *
 * Isto é uma checagem "otimista" para a experiência ficar boa. A proteção de
 * verdade dos dados acontece de novo no servidor (src/lib/data/user.ts) e no
 * banco (RLS) — nunca dependemos só do proxy.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, key } = supabaseEnv()

  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        // Respostas que gravam cookie de sessão nunca podem ficar em cache.
        for (const [header, value] of Object.entries(headers ?? {})) response.headers.set(header, value)
      },
    },
  })

  // Importante: nada entre createServerClient e getClaims (é aqui que a sessão é renovada).
  // getClaims confere a assinatura do token; um cookie falsificado não passa.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  if (pathname === '/') return redirectKeepingCookies(request, signedIn ? HOME_PATH : '/entrar', response)

  if (!signedIn && !isPublicPath(pathname)) {
    return redirectKeepingCookies(request, '/entrar', response, pathname + search)
  }

  if (signedIn && isGuestOnlyPath(pathname)) {
    return redirectKeepingCookies(request, HOME_PATH, response)
  }

  return response
}

/** Redireciona sem perder os cookies de sessão que acabaram de ser renovados. */
function redirectKeepingCookies(request: NextRequest, pathname: string, from: NextResponse, next?: string) {
  const target = request.nextUrl.clone()
  target.pathname = pathname
  target.search = ''
  if (next) target.searchParams.set('next', next)
  const redirect = NextResponse.redirect(target)
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie)
  for (const header of ['cache-control', 'expires', 'pragma']) {
    const value = from.headers.get(header)
    if (value) redirect.headers.set(header, value)
  }
  return redirect
}

export const config = {
  // Roda em tudo, menos arquivos estáticos (JS, CSS, fontes, imagens).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
}
