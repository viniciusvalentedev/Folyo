import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { HOME_PATH, isGuestOnlyPath, isPublicPath } from '@/lib/auth/redirects'
import { createLimiter, type Rule } from '@/lib/security/limiter'
import { authCookieOptions, supabaseEnv } from '@/lib/supabase/config'

/**
 * Proxy: roda no servidor ANTES de cada página.
 *
 * 1. Renova a sessão de login quando ela está para vencer (e grava o cookie novo).
 * 2. Quem não está logado e tenta abrir uma página da área do aluno vai para /entrar.
 * 3. Quem já está logado e abre /entrar vai direto para o início.
 *
 * 0. Antes de tudo: limite de pedidos por IP em TODAS as rotas e recusa de Server
 *    Actions sem o cabeçalho Origin (o navegador sempre manda).
 *
 * Isto é uma checagem "otimista" para a experiência ficar boa. A proteção de
 * verdade dos dados acontece de novo no servidor (src/lib/data/user.ts) e no
 * banco (RLS) — nunca dependemos só do proxy.
 */
/*
 * Limite de pedidos por IP, para qualquer endereço do site (páginas, Server Actions,
 * formulários de login e cadastro). Os números são folgados porque uma sala de aula
 * inteira pode sair pelo mesmo IP; quem segura abuso fino são os limites de cada
 * ação (login, cadastro, e-mails, painel) e os do banco.
 */
const limiter = createLimiter()
const LIMITS = {
  /** Abrir páginas e pré-carregar links. */
  read: { max: 2400, windowMs: 60_000 },
  /** Enviar algo (Server Actions, formulários). */
  write: { max: 600, windowMs: 60_000 },
} satisfies Record<string, Rule>

/** IP real só na Vercel (ela reescreve o x-forwarded-for). Fora dela: sem limite por IP. */
function requestIp(request: NextRequest) {
  if (process.env.VERCEL !== '1') return null
  const first = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return first || request.headers.get('x-real-ip')?.trim() || null
}

function tooMany() {
  return new NextResponse('Muitos pedidos seguidos. Espere um minuto e tente de novo.', {
    status: 429,
    headers: { 'Retry-After': '60', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function proxy(request: NextRequest) {
  const reading = request.method === 'GET' || request.method === 'HEAD'
  // Server Action sem Origin não vem de um navegador: recusa (o Next já recusa Origin de outro site).
  if (!reading && request.headers.has('next-action') && !request.headers.get('origin')) {
    return new NextResponse('Pedido recusado.', { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  const ip = requestIp(request)
  if (ip && !limiter.allow((reading ? 'r:' : 'w:') + ip, reading ? LIMITS.read : LIMITS.write)) return tooMany()

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
  // Cookie corrompido ou forjado pode fazer o getClaims lançar erro: vale como "não logado".
  const claims = await supabase.auth.getClaims().then((r) => r.data?.claims, () => null)
  const signedIn = Boolean(claims?.sub)
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
  // Roda em tudo, menos os arquivos do próprio Next (JS, CSS, fontes) e o ícone.
  // (Não excluímos por extensão: "/admin/x.png" também passa pelo proxy.)
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg).*)'],
}
