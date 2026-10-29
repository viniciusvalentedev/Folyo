'use client'

import { useEffect, useRef } from 'react'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { formatDateBR, PROMO, type PreAccess } from '@/lib/cart'
import { findCourse } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'

/** "Seu pré-acesso está liberado." As datas vêm do servidor (liberação + 30 dias). */
export function PreAccessConfirmation({ courses, leftover }: { courses: PreAccess[]; leftover: number }) {
  const { catalog } = useApp()
  const h1 = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    h1.current?.focus()
  }, [])

  const until = courses.map((c) => c.expiresAt).sort()[0]
  const first = courses[0]

  return (
    <div className="pre-ok">
      <span className="pre-ok-check" aria-hidden="true">
        <Icon name="Check" size={40} strokeWidth={2.5} />
      </span>
      <p className="pre-ok-kicker">Cupom {PROMO.code} reconhecido</p>
      <h1 ref={h1} tabIndex={-1} className="display-xl pre-ok-h">
        Seu pré-acesso está liberado.
      </h1>
      <p className="lead pre-ok-lead">
        <b>Nenhum pagamento foi realizado.</b> O acesso faz parte da promoção de lançamento da Folyo.
      </p>

      <div className="pre-ok-grid">
        <section className="pre-panel" aria-labelledby="pre-courses">
          <h2 id="pre-courses" className="pre-panel-h">
            Cursos incluídos
          </h2>
          <ul className="pre-list">
            {courses.map((c) => {
              const course = findCourse(catalog, c.id)
              return (
                <li key={c.id}>
                  {course && <CourseArt course={course} variant="thumb" ratio="1 / 1" className="fin-thumb" />}
                  <span className="pre-list-t">
                    <b>{c.title}</b>
                    <small>Liberado até {formatDateBR(c.expiresAt)}</small>
                  </span>
                  <ButtonLink href={'/cursos/' + c.id} variant="quiet-dark" size="sm" aria-label={`Abrir ${c.title}`}>
                    Abrir
                  </ButtonLink>
                </li>
              )
            })}
          </ul>
          {leftover > 0 && (
            <p className="pre-left">
              <Icon name="Info" size={15} />
              {plural(leftover, 'curso continua', 'cursos continuam')} no carrinho porque não {leftover === 1 ? 'participa' : 'participam'} da promoção.
            </p>
          )}
        </section>

        <section className="pre-panel" aria-label="Condições do pré-acesso">
          {until && <p className="pre-pill">1 mês de pré-acesso · até {formatDateBR(until)}</p>}
          <h2 className="pre-panel-h">Condições</h2>
          <ul className="pre-terms">
            <li>Válido por 30 dias a partir da liberação.</li>
            <li>Somente para os cursos listados.</li>
            <li>Sem cobrança e sem dados de pagamento.</li>
            <li>Ao fim do período, o acesso promocional se encerra.</li>
          </ul>
          <h2 className="pre-panel-h">Como acessar</h2>
          <p className="pre-how">
            Os cursos ficam em <b>Explorar cursos</b> com o selo <span className="plan pre">Pré-acesso</span>. É só abrir e começar.
          </p>
        </section>
      </div>

      <div className="fin-actions center">
        {first && (
          <ButtonLink href={'/cursos/' + first.id} variant="go" size="lg" iconRight="ArrowRight">
            Começar agora
          </ButtonLink>
        )}
        <ButtonLink href="/cursos" variant="ghost-on-dark" size="lg">
          Ver meus cursos
        </ButtonLink>
      </div>
    </div>
  )
}
