'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CheckoutHeader } from '@/components/cart/CartParts'
import { PreAccessConfirmation } from '@/components/cart/PreAccessConfirmation'
import { useCartQuote } from '@/components/cart/useCartQuote'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { useShop } from '@/components/providers/Shop'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { redeemCouponAction } from '@/lib/actions/cart'
import { formatBRL, REDEEM_FAILED, type CartQuote, type PreAccess } from '@/lib/cart'
import { findCourse } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'

type Done = { courses: PreAccess[]; leftover: number }

/**
 * Próxima etapa do carrinho. Com o cupom de lançamento válido: oferta de pré-acesso (o servidor
 * libera; nada é cobrado). Sem cupom: aviso de que o pagamento online ainda não existe.
 */
export function CheckoutView() {
  const { cart } = useShop()
  const router = useRouter()
  const [done, setDone] = useState<Done | null>(null)
  const { quote, error, retry } = useCartQuote(cart.ids, cart.coupon, cart.ready && !done)
  const handled = useRef<unknown>(null)

  // Carrinho vazio não tem o que finalizar.
  useEffect(() => {
    if (cart.ready && !cart.ids.length && !done) router.replace('/carrinho')
  }, [cart.ready, cart.ids.length, done, router])

  // Mesmo cuidado do carrinho: tira o que já é da pessoa e o cupom que deixou de valer.
  useEffect(() => {
    if (!quote || handled.current === quote) return
    handled.current = quote
    const gone = quote.dropped.map((x) => x.courseId)
    if (gone.length) cart.removeMany(gone)
    if (cart.coupon && quote.couponError) cart.clearCoupon()
  }, [quote, cart])

  if (done) {
    return (
      <Shell>
        <PreAccessConfirmation courses={done.courses} leftover={done.leftover} />
      </Shell>
    )
  }

  if (!quote) {
    return (
      <Shell>
        {error ? (
          <div className="fin-wait">
            <p className="alert alert-err" role="alert">
              <Icon name="CircleAlert" size={18} />
              <span>
                {error}{' '}
                <button type="button" className="link-btn" onClick={retry}>
                  Tentar de novo
                </button>
              </span>
            </p>
          </div>
        ) : (
          <div className="fin-wait" aria-busy="true" aria-label="Carregando">
            <span className="cart-skel cart-skel-title" />
            <span className="cart-skel cart-skel-line" />
            <span className="cart-skel cart-skel-line" />
          </div>
        )}
      </Shell>
    )
  }

  const launch = !!quote.coupon && quote.items.some((i) => i.eligible)
  return (
    <Shell>
      {launch ? (
        <LaunchOffer
          quote={quote}
          onDone={(r) => {
            setDone({ courses: r.courses, leftover: r.leftoverIds.length })
            // Só depois de o servidor confirmar: tira do carrinho o que foi liberado e o cupom.
            cart.removeMany([...r.courses.map((c) => c.id), ...r.droppedIds])
            cart.clearCoupon()
            // Recarrega os dados da conta (selo "Pré-acesso", vídeos liberados).
            router.refresh()
          }}
        />
      ) : (
        <CheckoutUnavailable quote={quote} />
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shop shop-dark surface-ink">
      <CheckoutHeader back={{ href: '/carrinho', label: 'Voltar ao carrinho' }} dark />
      <main id="main" tabIndex={-1} className="shop-main">
        {children}
      </main>
    </div>
  )
}

function LaunchOffer({ quote, onDone }: { quote: CartQuote; onDone: (r: { courses: PreAccess[]; leftoverIds: string[]; droppedIds: string[] }) => void }) {
  const { cart } = useShop()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (pending || !quote.coupon) return
    setPending(true)
    setError(null)
    try {
      const r = await redeemCouponAction({ courseIds: cart.ids, couponCode: quote.coupon })
      if (!r.ok) {
        setError(r.error)
        setPending(false)
        return
      }
      onDone(r)
    } catch {
      setError(REDEEM_FAILED)
      setPending(false)
    }
  }

  return (
    <div className="fin-grid">
      <section className="fin-main" aria-labelledby="fin-h">
        <p className="fin-badge">
          <Icon name="Sparkles" size={14} />
          Oferta de lançamento
        </p>
        <h1 id="fin-h" className="display-xl fin-h">
          Você chegou antes. <span className="txt-lime">Aproveite o lançamento da Folyo.</span>
        </h1>
        <p className="lead fin-lead">
          Estamos liberando o pré-acesso promocional aos cursos da Folyo. Com seu cupom de lançamento, você pode explorar os cursos elegíveis sem custo durante o
          período promocional.
        </p>
        <div className="fin-month">
          <span className="fin-month-n" aria-hidden="true">
            <b>1</b>
            <small>mês</small>
          </span>
          <div>
            <b>1 mês de pré-acesso promocional</b>
            <p>Uma oportunidade de conhecer a Folyo, desenvolver habilidades e transformar aprendizado em projetos para o seu portfólio.</p>
          </div>
        </div>
        {error && (
          <p className="alert alert-err" role="alert">
            <Icon name="CircleAlert" size={18} />
            <span>{error}</span>
          </p>
        )}
        <div className="fin-actions">
          <Button variant="go" size="lg" iconRight={pending ? undefined : 'ArrowRight'} onClick={go} disabled={pending} aria-busy={pending}>
            {pending ? (
              <>
                <span className="cart-spin" aria-hidden="true" /> Liberando pré-acesso…
              </>
            ) : (
              'Continuar para o pré-acesso'
            )}
          </Button>
          <ButtonLink href="/carrinho" variant="ghost-on-dark" size="lg">
            Voltar ao carrinho
          </ButtonLink>
        </div>
        <p className="fin-note">Nenhum pagamento é realizado. O desconto é uma condição promocional de lançamento.</p>
      </section>
      <SummaryCard quote={quote} launch />
    </div>
  )
}

function CheckoutUnavailable({ quote }: { quote: CartQuote }) {
  return (
    <div className="fin-grid">
      <section className="fin-main" aria-labelledby="fin-h">
        <span className="fin-clock" aria-hidden="true">
          <Icon name="Clock" size={22} />
        </span>
        <h1 id="fin-h" className="display-xl fin-h">
          O próximo passo seria o pagamento.
        </h1>
        <p className="lead fin-lead">
          Estamos preparando o checkout da Folyo. No momento, o pagamento online ainda não está disponível. Você pode retornar ao carrinho e aplicar um cupom
          promocional válido, se tiver um.
        </p>
        <div className="fin-actions">
          <ButtonLink href="/carrinho" variant="go" size="lg" icon="ArrowLeft">
            Voltar ao carrinho
          </ButtonLink>
        </div>
        <p className="fin-note">Nenhum valor foi cobrado e nenhum dado de pagamento foi pedido.</p>
      </section>
      <SummaryCard quote={quote} />
    </div>
  )
}

/** Cartão branco "Resumo" de /finalizar. */
function SummaryCard({ quote, launch }: { quote: CartQuote; launch?: boolean }) {
  const { catalog } = useApp()
  return (
    <aside className="fin-sum surface-paper" aria-label="Resumo">
      <p className="eyebrow blue">Resumo</p>
      <ul className="fin-items">
        {quote.items.map((l) => {
          const course = findCourse(catalog, l.courseId)
          const promo = launch && l.eligible
          return (
            <li key={l.courseId}>
              {course && <CourseArt course={course} variant="thumb" ratio="1 / 1" className="fin-thumb" />}
              <span className="fin-item-t">
                <b>{l.title}</b>
                {promo && (
                  <small className="fin-pre">
                    <Icon name="Sparkles" size={12} />
                    Pré-acesso de lançamento
                  </small>
                )}
              </span>
              <span className="fin-item-p">
                {promo && l.discountCents > 0 && <s>{formatBRL(l.priceCents)}</s>}
                <b>{formatBRL(promo ? l.finalCents : l.priceCents)}</b>
              </span>
            </li>
          )
        })}
      </ul>
      {launch && quote.coupon ? (
        <>
          <p className="totals-row">
            <span>Subtotal original</span>
            <b>{formatBRL(quote.subtotalCents)}</b>
          </p>
          <p className="totals-row">
            <span>Cupom utilizado</span>
            <code className="coupon-chip magenta">{quote.coupon}</code>
          </p>
          <p className="totals-row discount-paper">
            <span>Desconto de {quote.percentOff}%</span>
            <b>− {formatBRL(quote.discountCents)}</b>
          </p>
          <div className="totals-total">
            <span className="totals-k">Total promocional</span>
            <span className="totals-v">
              <b>{formatBRL(quote.totalCents)}</b>
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="totals-row">
            <span>Subtotal · {plural(quote.items.length, 'curso', 'cursos')}</span>
            <b>{formatBRL(quote.subtotalCents)}</b>
          </p>
          <div className="totals-total">
            <span className="totals-k">Total</span>
            <span className="totals-v">
              <b>{formatBRL(quote.totalCents)}</b>
            </span>
          </div>
        </>
      )}
    </aside>
  )
}
