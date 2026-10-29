'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/providers/AppState'
import { useShop } from '@/components/providers/Shop'
import { Icon } from '@/components/ui/Icon'
import { formatBRL, PROMO, type CourseOffer } from '@/lib/cart'
import { plural } from '@/lib/format'
import type { Course } from '@/lib/types'

/** Sacola do topo, com o número de cursos no carrinho. Leva para /carrinho. */
export function CartButton({ className = '' }: { className?: string }) {
  const { cart } = useShop()
  const n = cart.ready ? cart.count : 0
  return (
    <Link href="/carrinho" className={'icon-btn cart-btn ' + className} aria-label={n ? `Carrinho, ${plural(n, 'curso', 'cursos')}` : 'Carrinho'}>
      <Icon name="ShoppingBag" size={19} />
      {n > 0 && (
        // A chave muda com o número: a animação do contador roda de novo a cada mudança.
        <span key={n} className="cart-count" aria-hidden="true">
          {n}
        </span>
      )}
    </Link>
  )
}

/** Selo do curso no card: Gratuito / Curso pago / Pré-acesso / Comprado. */
export function OfferBadge({ offer, plan, showPlan }: { offer: CourseOffer; plan: Course['plan']; showPlan: boolean }) {
  if (offer.kind === 'pre-acesso') return <span className="plan pre">Pré-acesso</span>
  if (offer.kind === 'comprado') return <span className="plan bought">Comprado</span>
  if (offer.kind === 'a-venda' || offer.kind === 'equipe') return <span className="plan paid">Curso pago</span>
  if (!showPlan) return null
  return plan === 'free' ? <span className="plan free">Gratuito</span> : <span className="plan">Pro</span>
}

/**
 * Botão "Adicionar" do card. Clicar de novo tira do carrinho. Não abre o curso (o clique não
 * chega ao card). Mostra um aviso com atalho para o carrinho.
 */
export function AddToCartButton({ course }: { course: Course }) {
  const { cart } = useShop()
  const { toast } = useApp()
  const router = useRouter()
  const inCart = cart.ready && cart.has(course.id)
  return (
    <button
      type="button"
      className={'cart-add' + (inCart ? ' on' : '')}
      aria-pressed={inCart}
      aria-label={inCart ? `${course.title} está no carrinho. Remover` : `Adicionar ${course.title} ao carrinho`}
      onClick={(e) => {
        e.stopPropagation()
        if (inCart) {
          cart.remove(course.id)
          toast(`${course.title} saiu do carrinho.`, 'info', { ms: 5000 })
        } else {
          cart.add(course.id)
          toast(`${course.title} está no carrinho.`, 'ok', { ms: 5000, actionLabel: 'Ver carrinho', onAction: () => router.push('/carrinho') })
        }
      }}
    >
      {inCart ? (
        <>
          <span className="cart-add-idle">
            <Icon name="Check" size={15} />
            No carrinho
          </span>
          <span className="cart-add-hover" aria-hidden="true">
            <Icon name="X" size={15} />
            Remover
          </span>
        </>
      ) : (
        <>
          <Icon name="ShoppingBag" size={15} />
          Adicionar
        </>
      )}
    </button>
  )
}

/** Faixa do catálogo: só aparece com a promoção ligada e algum curso que participa. */
export function LaunchBanner() {
  const { promoCourses } = useShop()
  if (!promoCourses.length) return null
  return (
    <aside className="launch-strip" aria-label="Promoção de lançamento">
      <span className="launch-strip-ico" aria-hidden="true">
        <Icon name="Sparkles" size={16} />
      </span>
      <p>
        <b>Lançamento:</b> use o cupom <code className="coupon-chip">{PROMO.code}</code> no carrinho e ganhe 1 mês de pré-acesso.
      </p>
      <Link href="/carrinho" className="launch-strip-go">
        Ver carrinho
        <Icon name="ArrowRight" size={15} />
      </Link>
    </aside>
  )
}

/** Preço do card ("R$ 32,99") ou o selo de liberado. */
export function PriceLabel({ cents }: { cents: number }) {
  return <b className="ccard-price">{formatBRL(cents)}</b>
}
