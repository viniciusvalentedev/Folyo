'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { quoteCartAction } from '@/lib/actions/cart'
import type { CartQuote } from '@/lib/cart'

const OFFLINE = 'Sem conexão com o servidor. Confira sua internet e tente de novo.'

type State = { key: string; quote: CartQuote | null; error: string | null }

/**
 * Preços e total do carrinho, SEMPRE calculados no servidor. Recalcula quando os itens ou o
 * cupom mudam. Enquanto recalcula, mantém o último resultado (sem piscar "vazio").
 */
export function useCartQuote(ids: string[], coupon: string | null, enabled: boolean) {
  const key = JSON.stringify([ids, coupon])
  const [state, setState] = useState<State>({ key: '', quote: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const primed = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !ids.length) return
    // Já temos a resposta do servidor para estes itens e cupom (ex.: acabou de aplicar o cupom).
    if (primed.current === key) {
      primed.current = null
      return
    }
    let stale = false
    quoteCartAction({ courseIds: ids, couponCode: coupon })
      .then((r) => {
        if (stale) return
        setState((prev) => (r.ok ? { key, quote: r.quote, error: null } : { key, quote: prev.quote, error: r.error }))
      })
      .catch(() => {
        if (!stale) setState((prev) => ({ key, quote: prev.quote, error: OFFLINE }))
      })
    return () => {
      stale = true
    }
    // `key` resume ids e cupom; `attempt` força um novo pedido ("Tentar de novo").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  /** Usa uma resposta que o servidor acabou de dar (sem pedir de novo nem piscar). */
  const prime = useCallback((forIds: string[], forCoupon: string | null, quote: CartQuote) => {
    const k = JSON.stringify([forIds, forCoupon])
    primed.current = k
    setState({ key: k, quote, error: null })
  }, [])
  const empty = enabled && !ids.length
  return {
    prime,
    /** Resultado do servidor para ESTES itens e cupom (null enquanto não chega). */
    quote: empty ? null : state.key === key ? state.quote : null,
    /** Último resultado conhecido (pode ser de antes de uma mudança): bom para não piscar. */
    lastQuote: empty ? null : state.quote,
    loading: enabled && !empty && state.key !== key,
    error: state.key === key ? state.error : null,
    retry,
  }
}
