import { EMPTY_CART, parseStoredCart, type CartState } from '@/lib/cart'

/**
 * Onde o carrinho mora no navegador (localStorage), separado por conta.
 *
 * Guarda SÓ os ids dos cursos e o código do cupom digitado (nada de preço nem dado pessoal).
 * O localStorage pode falhar (aba privada, armazenamento cheio): aí o carrinho vive só na memória
 * desta aba. Outras abas abertas recebem as mudanças pelo evento "storage".
 */

export const CART_KEY = 'folyo-carrinho-v1'
export const COUPON_KEY = 'folyo-cupom-v1'

type Store = {
  state: CartState
  listeners: Set<() => void>
  loaded: boolean
}

const stores = new Map<string, Store>()

function keys(userId: string) {
  return { ids: `${CART_KEY}:${userId}`, coupon: `${COUPON_KEY}:${userId}` }
}

function load(userId: string): CartState {
  try {
    const k = keys(userId)
    return parseStoredCart(window.localStorage.getItem(k.ids), window.localStorage.getItem(k.coupon))
  } catch {
    return EMPTY_CART
  }
}

function save(userId: string, state: CartState) {
  try {
    const k = keys(userId)
    if (state.ids.length) window.localStorage.setItem(k.ids, JSON.stringify(state.ids))
    else window.localStorage.removeItem(k.ids)
    if (state.coupon) window.localStorage.setItem(k.coupon, state.coupon)
    else window.localStorage.removeItem(k.coupon)
  } catch {
    // Sem armazenamento: segue só na memória.
  }
}

function storeOf(userId: string): Store {
  let s = stores.get(userId)
  if (!s) {
    s = { state: EMPTY_CART, listeners: new Set(), loaded: false }
    stores.set(userId, s)
  }
  if (!s.loaded && typeof window !== 'undefined') {
    s.state = load(userId)
    s.loaded = true
  }
  return s
}

export type CartStore = {
  subscribe: (listener: () => void) => () => void
  get: () => CartState
  update: (fn: (s: CartState) => CartState) => void
}

/** Store do carrinho desta conta (o mesmo objeto para todos os componentes). */
export function cartStore(userId: string): CartStore {
  const notify = (s: Store) => s.listeners.forEach((l) => l())
  return {
    subscribe(listener) {
      const s = storeOf(userId)
      s.listeners.add(listener)
      const k = keys(userId)
      const onStorage = (e: StorageEvent) => {
        if (e.key !== null && e.key !== k.ids && e.key !== k.coupon) return
        s.state = load(userId)
        notify(s)
      }
      window.addEventListener('storage', onStorage)
      return () => {
        s.listeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    get: () => storeOf(userId).state,
    update(fn) {
      const s = storeOf(userId)
      const next = fn(s.state)
      if (next === s.state) return
      s.state = next
      save(userId, next)
      notify(s)
    },
  }
}
