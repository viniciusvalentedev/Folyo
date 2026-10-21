import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Content Security Policy: diz ao navegador de onde a página pode carregar
 * scripts, estilos, imagens etc. Isso bloqueia boa parte dos ataques de
 * injeção de código (XSS).
 *
 * Hoje tudo vem do próprio site ('self'). Quando ligarmos o Supabase e o
 * player de vídeo, os domínios deles entram em connect-src / frame-src / media-src.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "media-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Não deixa o navegador "adivinhar" o tipo de arquivo.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Ninguém pode colocar a Folyo dentro de um iframe (evita clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  // Ao clicar em links externos, não envia o endereço completo da página.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Desliga recursos do navegador que o site não usa.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // Força HTTPS por 2 anos (só tem efeito quando o site está em HTTPS).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  // Não anuncia "X-Powered-By: Next.js" (menos informação para quem quer atacar).
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default nextConfig
