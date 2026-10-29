'use client'

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { useApp } from '@/components/providers/AppState'
import { cartOps, EMPTY_CART, offerOf, type CourseOffer, type Shop } from '@/lib/cart'
import { cartStore } from '@/lib/cart-store'
import { isListed } from '@/lib/domain/catalog'
import type { Course } from '@/lib/types'

/**
 * Carrinho e situação de compra/pré-acesso de cada curso, para a TELA.
 *
 * O carrinho (ids + código do cupom) vive no navegador; preço, desconto e acesso vêm do servidor.
 * `shop` chega do layout (servidor) e é recarregado com router.refresh() depois de liberar o
 * pré-acesso.
 */

export type CartApi = {
  ids: string[]
  coupon: string | null
  /** O carrinho já foi lido do navegador (antes disso, não mostre "vazio"). */
  ready: boolean
  count: number
  has: (id: string) => boolean
  add: (id: string) => void
  remove: (id: string) => void
  toggle: (id: string) => void
  removeMany: (ids: readonly string[]) => void
  clear: () => void
  setCoupon: (code: string) => void
  clearCoupon: () => void
}

type ShopValue = {
  shop: Shop
  cart: CartApi
  offer: (course: Pick<Course, 'id' | 'priceCents'>) => CourseOffer
  /** Cursos pagos que a pessoa ainda pode comprar (publicados e listados). */
  forSale: Course[]
  /** Desses, os que participam do cupom de lançamento (vazio se a promoção está desligada). */
  promoCourses: Course[]
  /** Já tem algum pré-acesso de lançamento valendo. */
  hasPreAccess: boolean
}

const ShopContext = createContext<ShopValue | null>(null)

const noopSubscribe = () => () => {}

export function ShopProvider({ shop, children }: { shop: Shop; children: ReactNode }) {
  const { catalog, d } = useApp()
  const store = useMemo(() => cartStore(shop.userId), [shop.userId])
  const state = useSyncExternalStore(store.subscribe, store.get, () => EMPTY_CART)
  // false no servidor e na 1ª pintura; true depois de o navegador assumir.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false)

  const add = useCallback((id: string) => store.update((s) => cartOps.add(s, id)), [store])
  const remove = useCallback((id: string) => store.update((s) => cartOps.remove(s, id)), [store])
  const toggle = useCallback((id: string) => store.update((s) => cartOps.toggle(s, id)), [store])
  const removeMany = useCallback((ids: readonly string[]) => store.update((s) => cartOps.removeMany(s, ids)), [store])
  const clear = useCallback(() => store.update((s) => cartOps.clear(s)), [store])
  const setCoupon = useCallback((code: string) => store.update((s) => cartOps.setCoupon(s, code)), [store])
  const clearCoupon = useCallback(() => store.update((s) => cartOps.clearCoupon(s)), [store])

  const cart = useMemo<CartApi>(
    () => ({
      ids: state.ids,
      coupon: state.coupon,
      ready,
      count: state.ids.length,
      has: (id) => state.ids.includes(id),
      add,
      remove,
      toggle,
      removeMany,
      clear,
      setCoupon,
      clearCoupon,
    }),
    [state, ready, add, remove, toggle, removeMany, clear, setCoupon, clearCoupon],
  )

  const value = useMemo<ShopValue>(() => {
    const offer = (course: Pick<Course, 'id' | 'priceCents'>) => offerOf(course, shop)
    const forSale = catalog.courses.filter(
      (c) => c.status !== 'arquivado' && isListed(c, d.courseStats[c.id]?.started) && offer(c).kind === 'a-venda',
    )
    return {
      shop,
      cart,
      offer,
      forSale,
      promoCourses: shop.promoActive ? forSale.filter((c) => c.promo) : [],
      hasPreAccess: shop.access.some((a) => a.source === 'cupom' && a.active),
    }
  }, [shop, cart, catalog.courses, d.courseStats])

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
}

export function useShop() {
  const ctx = useContext(ShopContext)
  if (!ctx) throw new Error('useShop precisa estar dentro de <ShopProvider>')
  return ctx
}
