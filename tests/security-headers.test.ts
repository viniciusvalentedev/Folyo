import { describe, expect, it } from 'vitest'
import nextConfig from '../next.config'

type Rule = { source: string; headers: { key: string; value: string }[] }

async function rules() {
  return (await nextConfig.headers!()) as Rule[]
}
const header = (rule: Rule, key: string) => rule.headers.find((h) => h.key === key)?.value

describe('cabeçalhos de segurança (next.config.ts)', () => {
  it('o site todo tem CSP restritiva, anti-iframe, nosniff e HSTS', async () => {
    const site = (await rules())[0]
    const csp = header(site, 'Content-Security-Policy')!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(header(site, 'X-Frame-Options')).toBe('DENY')
    expect(header(site, 'X-Content-Type-Options')).toBe('nosniff')
    expect(header(site, 'Strict-Transport-Security')).toContain('max-age=')
    expect(header(site, 'Permissions-Policy')).toContain('camera=()')
  })

  it('só o CAPTCHA e o player de vídeo podem ser carregados de fora', async () => {
    const csp = header((await rules())[0], 'Content-Security-Policy')!
    expect(csp).toContain('https://challenges.cloudflare.com')
    expect(csp).toContain('https://iframe.mediadelivery.net')
    expect(csp).not.toMatch(/script-src[^;]*\*/)
  })

  it('rotas de PDF têm política própria e só abrem em iframe do próprio site', async () => {
    const all = await rules()
    for (const source of ['/api/trabalhos/:path*', '/api/materiais/:path*', '/api/admin/midia/:path*', '/api/u/:path*']) {
      const rule = all.find((r) => r.source === source)!
      expect(rule, source).toBeDefined()
      expect(header(rule, 'Content-Security-Policy')).toContain("frame-ancestors 'self'")
      expect(header(rule, 'X-Frame-Options')).toBe('SAMEORIGIN')
      expect(header(rule, 'X-Content-Type-Options')).toBe('nosniff')
    }
  })

  it('não anuncia que usa Next.js', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })
})
