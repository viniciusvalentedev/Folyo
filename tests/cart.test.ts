import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  CART_MAX,
  cartOps,
  droppedNotice,
  EMPTY_CART,
  formatBRL,
  formatDateBR,
  offerOf,
  parsePriceInput,
  parseStoredCart,
  priceInputValue,
  quoteSchema,
  type AccessRow,
  type CartState,
} from '@/lib/cart'
import { cartStore } from '@/lib/cart-store'

/** O Intl usa espaço não separável depois do "R$": normaliza para comparar. */
const brl = (cents: number) => formatBRL(cents).replace(/ /g, ' ')

describe('carrinho: operações', () => {
  test('adiciona vários e não duplica', () => {
    let s = cartOps.add(EMPTY_CART, 'mkt')
    s = cartOps.add(s, 'design')
    const same = cartOps.add(s, 'mkt')
    expect(same).toBe(s)
    expect(s.ids).toEqual(['mkt', 'design'])
  })

  test('remove, alterna e remove vários', () => {
    let s: CartState = { ids: ['a', 'b', 'c'], coupon: null }
    s = cartOps.remove(s, 'b')
    expect(s.ids).toEqual(['a', 'c'])
    expect(cartOps.remove(s, 'zzz')).toBe(s)
    s = cartOps.toggle(s, 'a')
    expect(s.ids).toEqual(['c'])
    s = cartOps.toggle(s, 'a')
    expect(s.ids).toEqual(['c', 'a'])
    expect(cartOps.removeMany(s, ['a', 'c']).ids).toEqual([])
  })

  test('recusa id fora do formato e respeita o limite', () => {
    expect(cartOps.add(EMPTY_CART, '../x')).toBe(EMPTY_CART)
    let s = EMPTY_CART
    for (let i = 0; i < CART_MAX + 5; i++) s = cartOps.add(s, 'c' + i)
    expect(s.ids).toHaveLength(CART_MAX)
  })

  test('cupom: normaliza e descarta código fora do formato', () => {
    expect(cartOps.setCoupon(EMPTY_CART, '  lancamento ').coupon).toBe('LANCAMENTO')
    const withCoupon = { ids: [], coupon: 'LANCAMENTO' }
    expect(cartOps.setCoupon(withCoupon, 'x; drop').coupon).toBeNull()
    expect(cartOps.clearCoupon(withCoupon).coupon).toBeNull()
    expect(cartOps.clear({ ids: ['a'], coupon: 'LANCAMENTO' })).toBe(EMPTY_CART)
  })

  test('lê do navegador só o que está no formato', () => {
    expect(parseStoredCart('["mkt","mkt","../x",3,"design"]', 'LANCAMENTO')).toEqual({ ids: ['mkt', 'design'], coupon: 'LANCAMENTO' })
    expect(parseStoredCart('{nao é json', '<script>')).toBe(EMPTY_CART)
    expect(parseStoredCart(null, null)).toBe(EMPTY_CART)
  })
})

describe('carrinho: guardado no navegador', () => {
  const data = new Map<string, string>()
  const listeners = new Set<(e: { key: string | null }) => void>()
  beforeEach(() => {
    data.clear()
    listeners.clear()
    ;(globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => void data.set(k, v),
        removeItem: (k: string) => void data.delete(k),
      },
      addEventListener: (_: string, fn: (e: { key: string | null }) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: { key: string | null }) => void) => listeners.delete(fn),
    }
  })
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window
  })

  test('guarda só ids e cupom, separado por conta', () => {
    const store = cartStore('user-a-' + Math.random())
    store.update((s) => cartOps.add(s, 'mkt'))
    store.update((s) => cartOps.setCoupon(s, 'lancamento'))
    const keys = [...data.keys()]
    expect(keys.some((k) => k.startsWith('folyo-carrinho-v1:user-a-'))).toBe(true)
    expect(keys.some((k) => k.startsWith('folyo-cupom-v1:user-a-'))).toBe(true)
    expect([...data.values()]).toEqual(['["mkt"]', 'LANCAMENTO'])
  })

  test('outra aba mudou: a store recarrega e avisa', () => {
    const uid = 'user-b-' + Math.random()
    const store = cartStore(uid)
    let calls = 0
    const stop = store.subscribe(() => calls++)
    data.set(`folyo-carrinho-v1:${uid}`, '["prog"]')
    listeners.forEach((fn) => fn({ key: `folyo-carrinho-v1:${uid}` }))
    expect(store.get().ids).toEqual(['prog'])
    expect(calls).toBe(1)
    stop()
  })

  test('sem localStorage (aba privada): funciona só na memória', () => {
    ;(globalThis as { window: { localStorage: unknown } }).window.localStorage = {
      getItem: () => {
        throw new Error('bloqueado')
      },
      setItem: () => {
        throw new Error('bloqueado')
      },
      removeItem: () => {
        throw new Error('bloqueado')
      },
    }
    const store = cartStore('user-c-' + Math.random())
    store.update((s) => cartOps.add(s, 'mkt'))
    expect(store.get().ids).toEqual(['mkt'])
  })
})

describe('dinheiro e datas', () => {
  test('centavos em R$', () => {
    expect(brl(3299)).toBe('R$ 32,99')
    expect(brl(10289)).toBe('R$ 102,89')
    expect(brl(0)).toBe('R$ 0,00')
    expect(brl(129990)).toBe('R$ 1.299,90')
  })

  test('data no formato do Brasil (horário de Brasília)', () => {
    expect(formatDateBR('2026-11-28T02:00:00Z')).toBe('27/11/2026')
    expect(formatDateBR('lixo')).toBe('')
  })

  test('preço digitado no painel', () => {
    expect(parsePriceInput('32,99')).toBe(3299)
    expect(parsePriceInput('R$ 1.299,90')).toBe(129990)
    expect(parsePriceInput('49.9')).toBe(4990)
    expect(parsePriceInput('69')).toBe(6900)
    expect(parsePriceInput('')).toBeNull()
    expect(parsePriceInput('0,00')).toBeNull()
    expect(parsePriceInput('abc')).toBe('invalid')
    expect(parsePriceInput('-5')).toBe('invalid')
    expect(parsePriceInput('1,999')).toBe('invalid')
    expect(priceInputValue(3299)).toBe('32,99')
    expect(priceInputValue(null)).toBe('')
  })

  test('aviso de cursos removidos (singular e plural)', () => {
    expect(droppedNotice(1)).toBe('Um curso saiu do carrinho porque já está na sua conta ou não está mais à venda.')
    expect(droppedNotice(3)).toBe('3 cursos saíram do carrinho porque já estão na sua conta ou não estão mais à venda.')
  })
})

describe('situação do curso para a tela', () => {
  const row = (r: Partial<AccessRow>): AccessRow => ({ courseId: 'mkt', source: 'cupom', grantedAt: '2026-10-01', expiresAt: '2026-11-01', active: true, ...r })
  const shop = (access: AccessRow[], staff = false) => ({ access, staff })

  test('sem preço é gratuito', () => {
    expect(offerOf({ id: 'mkt' }, shop([]))).toEqual({ kind: 'gratuito' })
    expect(offerOf({ id: 'mkt', priceCents: 0 }, shop([]))).toEqual({ kind: 'gratuito' })
  })

  test('pago sem acesso está à venda; pré-acesso vencido também', () => {
    expect(offerOf({ id: 'mkt', priceCents: 3299 }, shop([]))).toEqual({ kind: 'a-venda', priceCents: 3299 })
    expect(offerOf({ id: 'mkt', priceCents: 3299 }, shop([row({ active: false })])).kind).toBe('a-venda')
  })

  test('pré-acesso em dia, liberação manual e equipe', () => {
    expect(offerOf({ id: 'mkt', priceCents: 3299 }, shop([row({})]))).toEqual({ kind: 'pre-acesso', until: '2026-11-01' })
    expect(offerOf({ id: 'mkt', priceCents: 3299 }, shop([row({}), row({ source: 'manual', expiresAt: null })])).kind).toBe('comprado')
    expect(offerOf({ id: 'mkt', priceCents: 3299 }, shop([], true)).kind).toBe('equipe')
  })
})

describe('resposta do servidor', () => {
  const ok = {
    items: [{ courseId: 'mkt', title: 'Marketing', priceCents: 3299, eligible: true, discountCents: 3299, finalCents: 0 }],
    dropped: [{ courseId: 'gratis', reason: 'gratuito' }],
    subtotalCents: 3299,
    discountCents: 3299,
    totalCents: 0,
    coupon: 'LANCAMENTO',
    couponError: null,
    percentOff: 100,
    accessDays: 30,
  }

  test('aceita o formato do banco', () => {
    expect(quoteSchema.safeParse(ok).success).toBe(true)
  })

  test('recusa total negativo e valores quebrados', () => {
    expect(quoteSchema.safeParse({ ...ok, totalCents: -1 }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...ok, subtotalCents: 32.99 }).success).toBe(false)
    expect(quoteSchema.safeParse({ ...ok, dropped: [{ courseId: 'x', reason: 'outro' }] }).success).toBe(false)
  })
})
