import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { isGuestOnlyPath, isPublicPath } from '@/lib/auth/redirects'
import { INDEXABLE_PATHS, isIndexable, PRIVATE_PATHS, publicRobots, SITE_URL } from '@/lib/seo'

afterEach(() => vi.unstubAllEnvs())

describe('quando o Google pode indexar', () => {
  it('só na produção', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    expect(isIndexable()).toBe(true)
    expect(publicRobots()).toEqual({ index: true, follow: true })
  })

  it('produção fora da Vercel (sem VERCEL_ENV) também vale', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', '')
    expect(isIndexable()).toBe(true)
  })

  it('previews da Vercel e desenvolvimento ficam fechados', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    expect(isIndexable()).toBe(false)
    expect(publicRobots()).toEqual({ index: false, follow: false })
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('VERCEL_ENV', '')
    expect(isIndexable()).toBe(false)
  })
})

describe('robots.txt', () => {
  it('na produção libera o site, bloqueia a área logada e aponta o sitemap', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'production')
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rule.allow).toBe('/')
    expect(rule.disallow).toEqual(expect.arrayContaining(['/admin', '/api', '/inicio', '/cursos', '/entrar']))
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`)
  })

  it('fora da produção bloqueia tudo', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('VERCEL_ENV', 'preview')
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules
    expect(rule.disallow).toBe('/')
    expect(r.sitemap).toBeUndefined()
  })

  it('nenhuma página pública fica bloqueada', () => {
    for (const p of INDEXABLE_PATHS) {
      expect((PRIVATE_PATHS as readonly string[]).some((x) => p === x || p.startsWith(x + '/'))).toBe(false)
    }
  })
})

describe('sitemap.xml', () => {
  it('lista só páginas públicas, com endereço completo e sem repetir', () => {
    const urls = sitemap().map((e) => e.url)
    expect(urls).toEqual([`${SITE_URL}/`, `${SITE_URL}/termos`, `${SITE_URL}/privacidade`])
    expect(new Set(urls).size).toBe(urls.length)
    for (const url of urls) {
      const path = new URL(url).pathname
      expect(isPublicPath(path)).toBe(true)
      expect(isGuestOnlyPath(path)).toBe(false)
    }
  })

  it('usa o domínio oficial com https', () => {
    expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/)
  })
})
