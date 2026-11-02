import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: () => {}, push: () => {} }) }))

import { PreviousPurchases, PURCHASES_HREF, PurchasesList } from '@/app/(app)/(main)/compras/PurchasesView'
import { parseSection, SECTIONS } from '@/app/(app)/(main)/configuracoes/sections'
import { NAV_GROUPS } from '@/components/shell/nav'
import type { MyOrder } from '@/lib/payments/order'

/** "Minhas compras" (em Configurações): o que aparece para cada situação do pedido (renderização no servidor, sem navegador). */

const ID = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const order = (over: Partial<MyOrder> = {}): MyOrder => ({
  id: ID,
  status: 'pago',
  totalCents: 8289,
  createdAt: '2026-11-02T15:00:00.000Z',
  paidAt: '2026-11-02T15:30:00.000Z',
  refundedAt: null,
  payment: null,
  items: [
    { courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 3299 },
    { courseId: 'design', title: 'Design Gráfico', priceCents: 4990 },
  ],
  ...over,
})
const html = (orders: MyOrder[]) => renderToStaticMarkup(createElement(PurchasesList, { orders })).replace(/ /g, ' ')

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

  test('pedido em aberto sem pagamento iniciado: aviso e botão para a página de pagamento (dentro do site)', () => {
    const out = html([order({ status: 'pendente', paidAt: null })])
    expect(out).toContain('Aguardando pagamento')
    expect(out).toContain('Criado em 2 de novembro de 2026')
    expect(out).toContain(`href="/finalizar/pagamento?pedido=${ID}"`)
    expect(out).toContain('Continuar pagamento')
    expect(out).toContain('Nada foi cobrado por este pedido')
    expect(out).not.toContain('Abrir curso')
    expect(out).toContain('Total</span>')
  })

  test.each([
    [{ method: 'pix', status: 'aguardando_pix', until: '2026-11-02T16:00:00.000Z' }, 'Pix gerado, aguardando o pagamento'],
    [{ method: 'cartao', status: 'aguardando_acao', until: '2026-11-02T16:00:00.000Z' }, 'O seu banco pede uma confirmação'],
    [{ method: 'cartao', status: 'processando', until: '2026-11-02T16:00:00.000Z' }, 'O pagamento está em análise'],
  ] as const)('pedido em aberto com pagamento em andamento (%o)', (payment, text) => {
    const out = html([order({ status: 'pendente', paidAt: null, payment })])
    expect(out).toContain(text)
    expect(out).toContain(`href="/finalizar/pagamento?pedido=${ID}"`)
  })

  test('pedido pago ou estornado nunca oferece continuar o pagamento', () => {
    expect(html([order({ status: 'pago' })])).not.toContain('/finalizar/pagamento')
    expect(html([order({ status: 'reembolsado', refundedAt: '2026-11-03T10:00:00.000Z' })])).not.toContain('/finalizar/pagamento')
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

describe('Compras anteriores (no carrinho)', () => {
  const previous = (orders: MyOrder[]) => renderToStaticMarkup(createElement(PreviousPurchases, { orders })).replace(/\u00a0/g, ' ')

  test('sem compras pagas: não mostra nada', () => {
    expect(previous([])).toBe('')
    expect(previous([order({ status: 'pendente', paidAt: null })])).toBe('')
    expect(previous([order({ status: 'cancelado', paidAt: null }), order({ status: 'expirado', paidAt: null })])).toBe('')
  })

  test('mostra o pedido pago e o caminho para ver todas as compras em Configurações', () => {
    const out = previous([order()])
    expect(out).toContain('Compras anteriores')
    expect(out).toContain('Pedido 3F2B8C1E')
    expect(out).toContain('href="/cursos/mkt"')
    expect(out).toContain(`href="${PURCHASES_HREF}"`)
  })

  test('pedido em aberto fica de fora (o carrinho já é o caminho para pagar), o estornado aparece', () => {
    const open = order({ id: '11111111-2222-4333-8444-555555555555', status: 'pendente', paidAt: null })
    const out = previous([open, order({ status: 'reembolsado', refundedAt: '2026-11-03T10:00:00.000Z' })])
    expect(out).not.toContain('Pedido 11111111')
    expect(out).not.toContain('Continuar pagamento')
    expect(out).toContain('Estornado')
  })

  test('mostra só as 3 compras mais recentes', () => {
    const many = ['a', 'b', 'c', 'd'].map((x, i) => order({ id: `${x.repeat(8)}-6a4d-4e0b-9c53-7d1a2b3c4d5${i}` }))
    const out = previous(many)
    expect(out).toContain('Pedido AAAAAAAA')
    expect(out).toContain('Pedido CCCCCCCC')
    expect(out).not.toContain('Pedido DDDDDDDD')
  })
})

describe('Onde "Minhas compras" fica', () => {
  test('o endereço leva para a seção de compras de Configurações', () => {
    expect(PURCHASES_HREF).toBe('/configuracoes?secao=compras')
    expect(parseSection('compras')).toBe('compras')
  })

  test('Configurações: "Minhas compras" fica logo abaixo de "Dados pessoais"', () => {
    const ids = SECTIONS.map((s) => s.id)
    expect(ids.slice(0, 2)).toEqual(['dados', 'compras'])
  })

  test('?secao= inválido, vazio ou repetido não quebra a tela', () => {
    expect(parseSection(undefined)).toBe('dados')
    expect(parseSection('')).toBe('dados')
    expect(parseSection('admin')).toBe('dados')
    expect(parseSection(['compras', 'conta'])).toBe('compras')
    expect(parseSection(['x'])).toBe('dados')
  })

  test('o menu lateral não tem mais "Minhas compras"', () => {
    const items = NAV_GROUPS.flatMap((g) => g.items)
    expect(items.some((i) => i.to === '/compras' || i.label === 'Minhas compras')).toBe(false)
  })
})
