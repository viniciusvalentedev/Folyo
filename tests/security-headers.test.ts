import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import nextConfig from '../next.config'

// O mesmo leitor de endereços que o Next usa para casar `source` dos cabeçalhos (sem tipos próprios).
const { pathToRegexp } = createRequire(import.meta.url)('next/dist/compiled/path-to-regexp') as { pathToRegexp: (source: string) => RegExp }

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
    // O Mercado Pago só é liberado na página de pagamento.
    expect(csp).not.toMatch(/mercadopago|mercadolibre|mercadolivre|mlstatic/)
  })

  describe('página de pagamento (/finalizar/pagamento)', () => {
    const payment = async () => (await rules()).find((r) => r.source === '/finalizar/pagamento/:path*')!

    it('tem política própria, que libera o Mercado Pago só em script, conexão, iframe e imagem', async () => {
      const rule = await payment()
      expect(rule).toBeDefined()
      const csp = header(rule, 'Content-Security-Policy')!
      const directive = (name: string) => csp.split('; ').find((d) => d.startsWith(name + ' '))!
      for (const name of ['script-src', 'connect-src', 'frame-src', 'img-src']) {
        expect(directive(name), name).toContain('https://*.mercadopago.com')
        expect(directive(name), name).toContain('https://*.mlstatic.com')
        expect(directive(name), name).toContain('https://*.mercadolivre.com ')
      }
      for (const name of ['default-src', 'style-src', 'font-src', 'media-src', 'object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
        expect(directive(name), name).not.toMatch(/mercado|mlstatic/)
      }
    })

    it('continua restrita: nada de curinga solto, https: geral, eval, e ninguém a coloca em iframe', async () => {
      const rule = await payment()
      const csp = header(rule, 'Content-Security-Policy')!
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toContain("'unsafe-eval'")
      expect(csp).not.toMatch(/(script|frame|connect)-src[^;]*( \*| https:)(;| |$)/)
      expect(csp).not.toMatch(/(script|frame|connect)-src[^;]*http:/)
      expect(header(rule, 'X-Frame-Options')).toBe('DENY')
      expect(header(rule, 'X-Content-Type-Options')).toBe('nosniff')
      expect(header(rule, 'Strict-Transport-Security')).toContain('max-age=')
    })

    it('todo endereço recebe UMA política só: o pagamento não cai na geral e nenhum vizinho fica sem política', async () => {
      const all = (await rules()).filter((r) => header(r, 'Content-Security-Policy'))
      const paths = [
        '/',
        '/inicio',
        '/finalizar',
        '/finalizar/retorno',
        '/finalizar/pagamento',
        '/finalizar/pagamento/',
        '/finalizar/pagamento/qualquer',
        '/finalizar/pagamentos',
        '/finalizar/pagamento-x',
        '/compras',
        '/api/webhooks/mercadopago',
        '/api/trabalhos/abc/arquivo',
      ]
      for (const path of paths) {
        const matching = all.filter((r) => pathToRegexp(r.source).test(path))
        expect(matching.length, path).toBe(1)
      }
      const only = all.filter((r) => pathToRegexp(r.source).test('/finalizar/pagamento'))
      expect(only[0].source).toBe('/finalizar/pagamento/:path*')
      const neighbour = all.filter((r) => pathToRegexp(r.source).test('/finalizar/pagamento-x'))
      expect(header(neighbour[0], 'Content-Security-Policy')).not.toMatch(/mercadopago/)
    })
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
