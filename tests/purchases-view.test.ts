import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: () => {}, push: () => {} }) }))

import { PurchasesView } from '@/app/(app)/(main)/compras/PurchasesView'
import type { MyOrder } from '@/lib/payments/order'

/** Página "Minhas compras": o que aparece para cada situação do pedido (renderização no servidor, sem navegador). */

const ID = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const PAY = 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123-abc'
const order = (over: Partial<MyOrder> = {}): MyOrder => ({
  id: ID,
  status: 'pago',
  totalCents: 8289,
  createdAt: '2026-11-02T15:00:00.000Z',
  paidAt: '2026-11-02T15:30:00.000Z',
  refundedAt: null,
  checkoutUrl: null,
  items: [
    { courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 3299 },
    { courseId: 'design', title: 'Design Gráfico', priceCents: 4990 },
  ],
  ...over,
})
const html = (orders: MyOrder[]) => renderToStaticMarkup(createElement(PurchasesView, { orders })).replace(/ /g, ' ')

describe('Minhas compras', () => {
  test('sem compras: mostra o estado vazio e o caminho para os cursos', () => {
    const out = html([])
    expect(out).toContain('Você ainda não fez nenhuma compra')
    expect(out).toContain('href="/cursos"')
  })

  test('pedido pago: número, data, itens, total e "Abrir curso" de cada um', () => {
    const out = html([order()])
    expect(out).toContain('Pedido 3F2B8C1E')
    expect(out).toContain('Pago em 2 de novembro de 2026')
    expect(out).toContain('Pago')
    expect(out).toContain('Marketing Estratégico')
    expect(out).toContain('R$ 82,89')
    expect(out).toContain('href="/cursos/mkt"')
    expect(out).toContain('href="/cursos/design"')
    expect(out).toContain('Total pago')
    expect(out).not.toContain('Continuar pagamento')
  })

  test('pedido em aberto: aviso e botão para continuar o pagamento no Mercado Pago', () => {
    const out = html([order({ status: 'pendente', paidAt: null, checkoutUrl: PAY })])
    expect(out).toContain('Aguardando pagamento')
    expect(out).toContain('Criado em 2 de novembro de 2026')
    expect(out).toContain(`href="${PAY.replace(/&/g, '&amp;')}"`)
    expect(out).toContain('Continuar pagamento')
    expect(out).not.toContain('Abrir curso')
    expect(out).toContain('Total</span>')
  })

  test('link de pagamento que não é do Mercado Pago nunca vira botão', () => {
    for (const url of ['https://evil.example/pagar', 'javascript:alert(1)', 'http://www.mercadopago.com.br/x', 'https://mercadopago.com.evil.example/x']) {
      const out = html([order({ status: 'pendente', paidAt: null, checkoutUrl: url })])
      expect(out).not.toContain('Continuar pagamento')
      expect(out).not.toContain('evil.example')
      expect(out).not.toContain('javascript:')
    }
  })

  test('pedido estornado: avisa que o acesso acabou e não oferece abrir o curso', () => {
    const out = html([order({ status: 'reembolsado', refundedAt: '2026-11-03T10:00:00.000Z' })])
    expect(out).toContain('Estornado')
    expect(out).toContain('o acesso aos cursos deste pedido foi encerrado')
    expect(out).not.toContain('Abrir curso')
  })

  test('título de curso é mostrado como texto, nunca como HTML', () => {
    const out = html([order({ items: [{ courseId: 'mkt', title: '<script>alert(1)</script>', priceCents: 1000 }] })])
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  test('mostra o e-mail de suporte para dúvidas', () => {
    expect(html([order()])).toContain('mailto:contato@usefolyo.com')
  })
})
