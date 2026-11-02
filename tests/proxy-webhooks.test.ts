import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * O proxy deixa o webhook de pagamento passar sem login (quem confere é a assinatura, na rota),
 * mas todo o resto de /api continua exigindo sessão.
 */

const getClaims = vi.fn()
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: { getClaims } }) }))

import { proxy } from '@/proxy'

const req = (path: string, method = 'POST') => new NextRequest('https://www.usefolyo.com' + path, { method })

describe('proxy e webhooks', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://exemplo.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste')
    getClaims.mockReset()
    getClaims.mockResolvedValue({ data: { claims: null } })
  })

  test('webhook sem login passa direto (e nem consulta a sessão)', async () => {
    const res = await proxy(req('/api/webhooks/mercadopago?data.id=1&type=payment'))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
  })

  test.each(['/api/materiais/abc', '/api/webhooks', '/api/webhookss/x', '/carrinho', '/finalizar/retorno'])('%s sem login continua indo para /entrar', async (path) => {
    const res = await proxy(req(path, 'GET'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location') ?? '').pathname).toBe('/entrar')
  })
})
