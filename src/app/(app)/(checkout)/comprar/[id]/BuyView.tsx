'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { CheckoutHeader } from '@/components/cart/CartParts'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { useShop } from '@/components/providers/Shop'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatBRL, formatDateBR } from '@/lib/cart'
import { categoryOf, findCourse, lessonsOf } from '@/lib/domain/catalog'
import { formatMinutes, plural } from '@/lib/format'

/** Página de compra de um curso: resumo e "Adicionar ao carrinho". Não há etapa de pagamento. */
export function BuyView({ id }: { id: string }) {
  const { catalog } = useApp()
  const { offer: offerOf, cart } = useShop()
  const router = useRouter()
  const course = findCourse(catalog, id)
  if (!course) return null

  const offer = offerOf(course)
  const lessons = lessonsOf(course)
  const minutes = lessons.reduce((sum, l) => sum + l.min, 0)
  const cat = categoryOf(catalog, course.cat).name
  const inCart = cart.ready && cart.has(course.id)
  const others = cart.ready ? cart.ids.filter((x) => x !== course.id).length : 0
  const forSale = offer.kind === 'a-venda' && course.status !== 'arquivado'

  const addAndGo = () => {
    cart.add(course.id)
    router.push('/carrinho')
  }

  return (
    <div className="shop surface-paper">
      <CheckoutHeader back={{ href: '/cursos/' + course.id, label: 'Voltar ao curso' }} />
      <main id="main" tabIndex={-1} className="shop-main buy-grid">
        <div className="buy-main">
          <p className="eyebrow buy-eyebrow">Seu próximo passo começa aqui.</p>
          <div className="buy-cover rise">
            <CourseArt course={course} ratio="16 / 9" big />
          </div>
          <h1 className="display buy-title">{course.title}</h1>
          <p className="lead">{course.summary}</p>
          <ul className="buy-chips">
            <li>
              <Icon name="Gauge" size={15} />
              {course.level}
            </li>
            <li>
              <Icon name="Clock" size={15} />
              {course.hours} h
            </li>
            {course.language && (
              <li>
                <Icon name="Languages" size={15} />
                {course.language}
              </li>
            )}
          </ul>
          {course.outcomes.length > 0 && (
            <section className="buy-learn">
              <h2 className="h-sec">O que você vai aprender</h2>
              <ul>
                {course.outcomes.map((o) => (
                  <li key={o}>
                    <Icon name="CircleCheck" size={17} />
                    {o}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="buy-card surface-ink rise" style={{ '--i': 1 } as CSSProperties} aria-label="Resumo da compra">
          <p className="eyebrow lime">Resumo da compra</p>
          <div className="buy-card-head">
            <CourseArt course={course} variant="thumb" ratio="1 / 1" className="buy-thumb" />
            <div>
              <b>{course.title}</b>
              <small>
                {cat} · {course.level}
              </small>
            </div>
          </div>
          <ul className="buy-includes">
            <li>
              <Icon name="Play" size={15} />
              {plural(lessons.length, 'aula', 'aulas')} · {formatMinutes(minutes)}
            </li>
            {course.project.title && (
              <li>
                <Icon name="FolderKanban" size={15} />
                Projeto prático: {course.project.title}
              </li>
            )}
            {course.certificate?.enabled !== false && (
              <li>
                <Icon name="Award" size={15} />
                Certificado de conclusão
              </li>
            )}
          </ul>

          {forSale ? (
            <>
              <div className="buy-total">
                <span className="totals-k">Total</span>
                <b>{formatBRL(offer.priceCents)}</b>
              </div>
              {inCart ? (
                <ButtonLink href="/carrinho" variant="go" size="lg" icon="ShoppingBag" className="wide">
                  Ir para o carrinho
                </ButtonLink>
              ) : (
                <Button variant="go" size="lg" icon="ShoppingBag" className="wide" onClick={addAndGo}>
                  Adicionar ao carrinho
                </Button>
              )}
              <p className="buy-hint">Tem um cupom de lançamento? Aplique no carrinho.</p>
              <p className="buy-soon">
                <span className="tag-soon">
                  <Icon name="Eye" size={12} />
                  Lançamento
                </span>
                O pagamento online ainda não está disponível.
              </p>
              {others > 0 && (
                <div className="buy-more">
                  <b>Você tem {plural(others, 'outro curso', 'outros cursos')} no carrinho.</b>
                  <ButtonLink href="/cursos" variant="quiet-dark" icon="Plus" className="wide">
                    Adicionar mais cursos
                  </ButtonLink>
                  <ButtonLink href="/carrinho" variant="ghost-on-dark" icon="ShoppingBag" className="wide">
                    Ver carrinho
                  </ButtonLink>
                </div>
              )}
            </>
          ) : (
            <div className="buy-owned">
              <p className="buy-owned-t">
                {offer.kind === 'gratuito'
                  ? 'Este curso é gratuito'
                  : offer.kind === 'pre-acesso'
                    ? `Você tem pré-acesso até ${formatDateBR(offer.until)}`
                    : offer.kind === 'a-venda'
                      ? 'Este curso não está mais à venda'
                      : 'Você já tem este curso'}
              </p>
              {offer.kind !== 'a-venda' && (
                <ButtonLink href={'/cursos/' + course.id} variant="go" size="lg" iconRight="ArrowRight" className="wide">
                  Acessar curso
                </ButtonLink>
              )}
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
