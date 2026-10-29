'use client'

import Link from 'next/link'
import { useId, useState, type FormEvent } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { COUPON_MAX, COUPON_MESSAGES, formatBRL, type CartLine, type CartQuote } from '@/lib/cart'
import { categoryOf } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { Course } from '@/lib/types'
import { CartButton } from './CartBits'

/** Topo simples das telas de compra: logo, voltar e carrinho. */
export function CheckoutHeader({ back, dark }: { back: { href: string; label: string }; dark?: boolean }) {
  return (
    <header className={'shop-top' + (dark ? ' dark' : '')}>
      <Link href="/inicio" className="shop-brand" aria-label="Folyo, ir para o início">
        <Wordmark height={26} tone={dark ? 'violet' : 'indigo'} text={dark ? '#fff' : 'var(--ink)'} />
      </Link>
      <div className="shop-top-right">
        <Link href={back.href} className="shop-back">
          <Icon name="ArrowLeft" size={16} />
          {back.label}
        </Link>
        <CartButton className="shop-cart" />
      </div>
    </header>
  )
}

/** Um curso no carrinho. O preço vem do servidor (`line`); sem ele, mostra o esqueleto. */
export function CartItem({ course, line, onRemove }: { course: Course; line: CartLine | undefined; onRemove: () => void }) {
  const { catalog } = useApp()
  const discounted = !!line && line.eligible && line.discountCents > 0
  return (
    <li className="cart-item">
      <CourseArt course={course} variant="thumb" ratio="1 / 1" className="cart-thumb" />
      <div className="cart-item-text">
        <Link href={'/comprar/' + course.id}>{course.title}</Link>
        <small>
          {categoryOf(catalog, course.cat).name} · {course.level} · {course.hours} h
        </small>
      </div>
      <div className="cart-item-price">
        {!line ? (
          <span className="cart-skel cart-skel-price" aria-label="Carregando preço" />
        ) : discounted ? (
          <>
            <s aria-label={`Preço original ${formatBRL(line.priceCents)}`}>{formatBRL(line.priceCents)}</s>
            <span className="price-zero">{formatBRL(line.finalCents)}</span>
          </>
        ) : (
          <b>{formatBRL(line.priceCents)}</b>
        )}
      </div>
      <IconButton icon="Trash2" label={`Remover ${course.title} do carrinho`} onClick={onRemove} className="cart-trash" />
    </li>
  )
}

/**
 * "Tem um cupom de lançamento?". `onApply` pergunta ao servidor e devolve a mensagem de erro
 * (ou null se o cupom valeu). Quem decide se o cupom vale é o banco.
 */
export function CouponBox({
  applied,
  percentOff,
  onApply,
  onRemove,
  someIneligible,
}: {
  applied: string | null
  percentOff: number
  onApply: (code: string) => Promise<string | null>
  onRemove: () => void
  someIneligible: boolean
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [shake, setShake] = useState(0)
  const id = useId()

  if (applied) {
    return (
      <div className="coupon-ok" role="status">
        <span className="coupon-ok-ico" aria-hidden="true">
          <Icon name="CircleCheck" size={18} />
        </span>
        <div className="coupon-ok-text">
          <b>Cupom de lançamento aplicado!</b>
          <span>Você desbloqueou {percentOff}% de desconto nos cursos elegíveis.</span>
          {someIneligible && <span className="coupon-note">Alguns cursos não participam da promoção e mantêm o preço.</span>}
          <button type="button" className="coupon-remove" onClick={onRemove} aria-label={`Remover o cupom ${applied}`}>
            <Icon name="X" size={14} />
            Remover
          </button>
        </div>
        <code className="coupon-chip">{applied}</code>
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pending) return
    if (!value.trim()) {
      setError(COUPON_MESSAGES.empty)
      setShake((n) => n + 1)
      return
    }
    setPending(true)
    setError(null)
    const problem = await onApply(value).catch(() => 'Sem conexão com o servidor. Confira sua internet e tente de novo.')
    setPending(false)
    if (problem) {
      setError(problem)
      setShake((n) => n + 1)
    } else {
      setValue('')
    }
  }

  return (
    <form className="coupon-box" onSubmit={submit} noValidate>
      <label htmlFor={id} className="coupon-title">
        <Icon name="Tag" size={16} />
        Tem um cupom de lançamento?
      </label>
      <div className="coupon-row">
        <input
          id={id}
          // Duas classes que se alternam: o "tremidinho" roda de novo a cada erro, sem perder o foco.
          className={'coupon-input' + (error ? ' bad' : '') + (shake ? (shake % 2 ? ' shake-a' : ' shake-b') : '')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          placeholder="Digite o código"
          maxLength={COUPON_MAX}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={!!error}
          aria-describedby={error ? id + '-err' : undefined}
        />
        <button type="submit" className="btn btn-quiet-dark btn-md coupon-apply" disabled={!value.trim() || pending}>
          {pending ? <span className="cart-spin" aria-label="Validando cupom" /> : <span>Aplicar cupom</span>}
        </button>
      </div>
      {error && (
        <p className="coupon-err" id={id + '-err'} role="alert">
          <Icon name="CircleAlert" size={15} />
          {error}
        </p>
      )}
    </form>
  )
}

/** Subtotal, desconto e total (tudo calculado pelo servidor). */
export function TotalsRows({ quote, dark = true }: { quote: CartQuote; dark?: boolean }) {
  const n = quote.items.length
  return (
    <div className={'totals' + (dark ? ' on-dark' : '')}>
      <p className="totals-row">
        <span>Subtotal · {plural(n, 'curso', 'cursos')}</span>
        <b>{formatBRL(quote.subtotalCents)}</b>
      </p>
      {quote.discountCents > 0 && quote.coupon && (
        <p className="totals-row discount">
          <span>
            Desconto · {quote.coupon} ({quote.percentOff}%)
          </span>
          <b>− {formatBRL(quote.discountCents)}</b>
        </p>
      )}
      <div className="totals-total">
        <span className="totals-k">Total</span>
        <span className="totals-v">
          {quote.discountCents > 0 && <s>{formatBRL(quote.subtotalCents)}</s>}
          <b>{formatBRL(quote.totalCents)}</b>
        </span>
      </div>
    </div>
  )
}

/** Esqueleto do carrinho enquanto os dados chegam (nunca mostra "vazio" antes da hora). */
export function CartSkeleton() {
  return (
    <div className="cart-grid" aria-busy="true" aria-label="Carregando o carrinho">
      <div>
        <span className="cart-skel cart-skel-title" />
        <ul className="cart-list">
          {[0, 1].map((i) => (
            <li key={i} className="cart-item">
              <span className="cart-skel cart-skel-thumb" />
              <span className="cart-skel cart-skel-line" />
            </li>
          ))}
        </ul>
      </div>
      <div className="cart-summary surface-ink">
        <span className="cart-skel cart-skel-line" />
        <span className="cart-skel cart-skel-line" />
        <span className="cart-skel cart-skel-total" />
      </div>
    </div>
  )
}
