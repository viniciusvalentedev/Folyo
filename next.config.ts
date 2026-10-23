import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Content Security Policy: diz ao navegador de onde a página pode carregar
 * scripts, estilos, imagens etc. Isso bloqueia boa parte dos ataques de
 * injeção de código (XSS).
 *
 * Quase tudo vem do próprio site ('self'). Exceção: o CAPTCHA da Cloudflare
 * (Turnstile), que carrega um script e mostra uma caixinha (iframe) de
 * challenges.cloudflare.com. O Supabase só entra em connect-src, para o envio de PDF
 * (veja SUPABASE_ORIGIN); todo o resto passa pelo servidor.
 */
const TURNSTILE = 'https://challenges.cloudflare.com'
/**
 * Única exceção ao "navegador nunca fala com o Supabase": o envio do PDF de um trabalho vai
 * direto para o Storage (a Vercel não aceita arquivo grande no servidor). O endereço é
 * liberado só em connect-src (não vira script, imagem nem iframe), vale para um arquivo
 * por vez, e o bucket é privado, aceita só PDF de até 20 MB e só na pasta do próprio aluno.
 */
const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ''
  } catch {
    return ''
  }
})()
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${TURNSTILE}${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${SUPABASE_ORIGIN ? ' ' + SUPABASE_ORIGIN : ''}${isDev ? ' ws:' : ''}`,
  "media-src 'self'",
  `frame-src 'self' ${TURNSTILE}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

/**
 * O PDF do aluno (/api/trabalhos/<id>/arquivo) abre numa aba própria. O leitor de PDF do
 * navegador não funciona com "object-src 'none'" (nem com "script-src"/"default-src", que o
 * leitor embutido de alguns navegadores respeita), então essa rota tem uma política só dela:
 * sem <base>, sem formulários e só pode aparecer em iframe da própria Folyo (a janela de
 * visualização do PDF). O tipo é sempre application/pdf, com nosniff, e o conteúdo é conferido
 * (%PDF-) antes de ser salvo.
 */
const pdfCsp = "base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
const PDF_ROUTE = 'api/trabalhos/'

const frameDeny = { key: 'X-Frame-Options', value: 'DENY' }
const frameSame = { key: 'X-Frame-Options', value: 'SAMEORIGIN' }
const baseHeaders = [
  // Não deixa o navegador "adivinhar" o tipo de arquivo.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
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
    return [
      // Ninguém pode colocar a Folyo dentro de um iframe de outro site (evita clickjacking).
      { source: `/((?!${PDF_ROUTE}).*)`, headers: [{ key: 'Content-Security-Policy', value: csp }, frameDeny, ...baseHeaders] },
      { source: '/api/trabalhos/:path*', headers: [{ key: 'Content-Security-Policy', value: pdfCsp }, frameSame, ...baseHeaders] },
    ]
  },
}

export default nextConfig
