import type { Metadata } from 'next'

/**
 * Tudo o que é "endereço e Google" num lugar só.
 * (Arquivo sem dependências do servidor: usado pelas páginas, pelo sitemap, pelo robots e pelos testes.)
 */

/** Endereço oficial do site. Pode ser trocado com NEXT_PUBLIC_SITE_URL (sem barra no fim). */
export const DEFAULT_SITE_URL = 'https://www.usefolyo.com'

function readSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (raw) {
    try {
      return new URL(raw).origin
    } catch {
      // Valor inválido na configuração: vale o endereço oficial.
    }
  }
  return DEFAULT_SITE_URL
}

export const SITE_URL = readSiteUrl()
export const SITE_NAME = 'Folyo'

/**
 * O Google só pode indexar o site "de verdade" (produção). Em desenvolvimento e nos
 * endereços de teste da Vercel (previews) tudo fica fechado, para a cópia de teste
 * nunca competir com o site oficial nem aparecer nas buscas.
 */
export function isIndexable(): boolean {
  if (process.env.NODE_ENV !== 'production') return false
  const vercelEnv = process.env.VERCEL_ENV
  return !vercelEnv || vercelEnv === 'production'
}

/**
 * Robots das páginas que DEVEM aparecer no Google (landing, termos e privacidade).
 * O padrão do site (src/app/layout.tsx) é "não indexar": uma página nova nunca vai
 * para o Google sem alguém ligar isso de propósito.
 */
export function publicRobots(): NonNullable<Metadata['robots']> {
  const on = isIndexable()
  return { index: on, follow: on }
}

/** Páginas abertas ao Google: o sitemap lista só estas. */
export const INDEXABLE_PATHS = ['/', '/termos', '/privacidade'] as const

/**
 * Áreas que o robots.txt pede para o Google nem visitar (login, painel, área do aluno e API).
 * Mesmo sem isso o proxy manda quem não está logado para /entrar; aqui é só um aviso a mais.
 */
export const PRIVATE_PATHS = [
  '/admin',
  '/api',
  '/aula',
  '/auth',
  '/certificados',
  '/competencias',
  '/configuracoes',
  '/conta-suspensa',
  '/cursos',
  '/curriculo',
  '/entrar',
  '/esqueci-senha',
  '/inicio',
  '/objetivos',
  '/perfil',
  '/primeiro-acesso',
  '/progresso',
  '/projetos',
  '/publico',
  '/redefinir-senha',
  '/seguranca',
] as const
