'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CartItem, CartSkeleton, CheckoutHeader, CouponBox, TotalsRows } from '@/components/cart/CartParts'
import { useCartQuote } from '@/components/cart/useCartQuote'
import { useApp } from '@/components/providers/AppState'
import { useShop } from '@/components/providers/Shop'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { quoteCartAction } from '@/lib/actions/cart'
import { COUPON_MESSAGES, droppedNotice, formatBRL, type CartQuote } from '@/lib/cart'
import { findCourse } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { Course } from '@/lib/types'

/** Carrinho: itens, cupom e totais. Todo valor mostrado aqui veio do servidor. */
export function CartView() {
  const { catalog } = useApp()
  const { cart, forSale } = useShop()
  const router = useRouter()
  const { quote, lastQuote, error, retry, prime } = useCartQuote(cart.ids, cart.coupon, cart.ready)
  const [removed, setRemoved] = useState(0)
  const [counted, setCounted] = useState<CartQuote | null>(null)
  const handled = useRef<unknown>(null)

  // Quantos cursos saíram sozinhos (para o aviso): conta uma vez por resposta do servidor.
  if (quote && quote !== counted) {
    setCounted(quote)
    if (quote.dropped.length) setRemoved(removed + quote.dropped.length)
  }

  // Resposta nova do servidor: tira o que já é da pessoa (ou saiu de venda) e o cupom que deixou de valer.
  useEffect(() => {
    if (!quote || handled.current === quote) return
    handled.current = quote
    const gone = quote.dropped.map((x) => x.courseId)
    if (gone.length) cart.removeMany(gone)
    if (cart.coupon && quote.couponError) cart.clearCoupon()
  }, [quote, cart])

  const shown = quote ?? lastQuote
  const lines = new Map(shown?.items.map((l) => [l.courseId, l]))
  const courses = cart.ids.map((id) => findCourse(catalog, id)).filter((c): c is Course => !!c)
  const more = forSale.filter((c) => !cart.has(c.id)).length

  if (!cart.ready || (cart.ids.length > 0 && !shown && !error)) {
    return (
      <Shell>
        <CartSkeleton />
      </Shell>
    )
  }

  if (!cart.ids.length) {
    return (
      <Shell>
        {removed > 0 && <RemovedNotice n={removed} />}
        <EmptyCart />
      </Shell>
    )
  }

  const apply = async (code: string) => {
    const r = await quoteCartAction({ courseIds: cart.ids, couponCode: code })
    if (!r.ok) return r.error
    if (r.quote.couponError || !r.quote.coupon) return r.quote.couponError ?? COUPON_MESSAGES.invalid
    prime(cart.ids, r.quote.coupon, r.quote)
    cart.setCoupon(r.quote.coupon)
    return null
  }

  const appliedCoupon = shown?.coupon && cart.coupon ? shown.coupon : null

  return (
    <Shell>
      <div className="cart-grid">
        <section aria-labelledby="cart-h">
          <p className="eyebrow blue">Carrinho</p>
          <h1 id="cart-h" className="display cart-h">
            {plural(courses.length, 'curso escolhido', 'cursos escolhidos')}
          </h1>
          {removed > 0 && <RemovedNotice n={removed} />}
          {error && (
            <p className="alert alert-err" role="alert">
              <Icon name="CircleAlert" size={18} />
              <span>
                {error}{' '}
                <button type="button" className="link-btn" onClick={retry}>
                  Tentar de novo
                </button>
              </span>
            </p>
          )}
          <ul className="cart-list">
            {courses.map((c) => (
              <CartItem key={c.id} course={c} line={lines.get(c.id)} onRemove={() => cart.remove(c.id)} />
            ))}
          </ul>
          <Link href="/cursos" className="cart-more">
            <span className="cart-more-plus" aria-hidden="true">
              <Icon name="Plus" size={18} />
            </span>
            <span className="cart-more-text">
              <b>Adicionar mais cursos</b>
              <small>{more ? `${plural(more, 'curso disponível', 'cursos disponíveis')}` : 'Veja o catálogo'}</small>
            </span>
            <Icon name="ArrowRight" size={18} />
          </Link>
        </section>

        <aside className="cart-summary surface-ink" aria-label="Resumo">
          <p className="eyebrow txt-lime">Resumo</p>
          {shown && (
            <>
              <ul className="sum-lines">
                {shown.items.map((l) => (
                  <li key={l.courseId}>
                    <span>{l.title}</span>
                    <b>{formatBRL(l.priceCents)}</b>
                  </li>
                ))}
              </ul>
              <CouponBox
                applied={appliedCoupon}
                percentOff={shown.percentOff}
                onApply={apply}
                onRemove={cart.clearCoupon}
                someIneligible={shown.items.some((l) => !l.eligible)}
              />
              <TotalsRows quote={shown} />
            </>
          )}
          <Button variant="go" size="lg" iconRight="ArrowRight" className="btn-wide" disabled={!shown?.items.length} onClick={() => router.push('/finalizar')}>
            Prosseguir com a compra
          </Button>
          <p className="sum-foot">
            {appliedCoupon ? 'Desconto promocional de lançamento. Nada é cobrado.' : 'Você confere tudo na próxima etapa. Nada é cobrado agora.'}
          </p>
        </aside>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop surface-paper">
      <CheckoutHeader back={{ href: '/cursos', label: 'Voltar aos cursos' }} />
      <main id="main" tabIndex={-1} className="shop-main">
        {children}
      </main>
    </div>
  )
}

function RemovedNotice({ n }: { n: number }) {
  return (
    <p className="alert alert-info" role="status">
      <Icon name="Info" size={18} />
      <span>{droppedNotice(n)}</span>
    </p>
  )
}

function EmptyCart() {
  return (
    <div className="cart-grid">
      <section className="cart-empty">
        <div className="cart-empty-art" aria-hidden="true">
          <span className="c1" />
          <span className="c2" />
          <span className="c3" />
          <Icon name="ShoppingBag" size={56} />
        </div>
        <h1 className="display cart-h">Seu carrinho está vazio</h1>
        <p className="lead">Explore os cursos, adicione os que quiser e confira tudo aqui antes de seguir.</p>
        <ButtonLink href="/cursos" icon="Compass">
          Explorar cursos
        </ButtonLink>
      </section>
      <aside className="cart-summary surface-ink" aria-label="Resumo">
        <p className="eyebrow txt-lime">Resumo</p>
        <div className="totals on-dark">
          <div className="totals-total">
            <span className="totals-k">Total</span>
            <span className="totals-v">
              <b>{formatBRL(0)}</b>
            </span>
          </div>
        </div>
        <Button variant="go" size="lg" iconRight="ArrowRight" className="btn-wide" disabled aria-describedby="cart-empty-hint">
          Prosseguir com a compra
        </Button>
        <p className="sum-foot" id="cart-empty-hint">
          Adicione pelo menos um curso para prosseguir.
        </p>
      </aside>
    </div>
  )
}
