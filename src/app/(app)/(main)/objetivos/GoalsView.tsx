'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Progress } from '@/components/ui/indicators'
import { PageHead } from '@/components/ui/PageHead'
import { findCourse, sameText } from '@/lib/domain/catalog'
import { GOAL_ICONS } from '@/lib/goal-icons'
import type { Course } from '@/lib/types'

export function GoalsView() {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const goal = d.goal

  const has = goal ? goal.skills.filter((sk) => s.skills.some((k) => sameText(k.name, sk))) : []
  const missing = goal ? goal.skills.filter((sk) => !has.includes(sk)) : []
  const courses = goal ? goal.courses.map((id) => findCourse(catalog, id)).filter((c): c is Course => !!c) : []

  const actions: { t: string; m: string; to: string }[] = []
  if (goal) {
    const next = courses.find((c) => !d.courseStats[c.id].complete)
    if (next) {
      const st = d.courseStats[next.id]
      actions.push({
        t: st.started ? `Continuar ${next.title}` : `Começar ${next.title}`,
        m: st.started ? `${st.pct}% concluído` : `${next.hours} h · ${next.level}`,
        to: '/cursos/' + next.id,
      })
    }
    const project = s.projects.find((p) => p.status === 'andamento' && p.courseId && goal.courses.includes(p.courseId))
    if (project) actions.push({ t: `Finalizar ${project.title}`, m: 'Projeto ligado a este objetivo', to: '/projetos/' + project.id })
    if (missing.length) actions.push({ t: `Desenvolver ${missing[0]}`, m: 'Competência que ainda falta', to: '/competencias' })
    actions.push({ t: 'Ajustar o objetivo do currículo', m: 'Deixe claro para onde você quer ir', to: '/curriculo' })
  }

  return (
    <div className="page surface-paper goals-page">
      <PageHead
        eyebrow="Direção"
        title="Objetivos de carreira"
        lead="Escolha para onde você quer ir. A Folyo usa isso para sugerir cursos, projetos e competências. Você pode mudar quando quiser."
      />

      {goal && (
        <>
          <section className="goal-current rise" style={{ '--i': 1 } as CSSProperties}>
            <div className="gc-main">
              <p className="eyebrow on-blue">Objetivo principal</p>
              <h2>{goal.title}</h2>
              <p>{goal.blurb}</p>
              <div className="gc-prog">
                <Progress value={(has.length / goal.skills.length) * 100} size="lg" label="Competências registradas para o objetivo" />
                <span>
                  {has.length} de {goal.skills.length} competências registradas
                </span>
              </div>
            </div>
            <div className="gc-actions">
              <p className="eyebrow on-blue">Próximas ações</p>
              <ol>
                {actions.slice(0, 4).map((x, i) => (
                  <li key={x.t}>
                    <button type="button" onClick={() => router.push(x.to)}>
                      <span className="gc-n">{i + 1}</span>
                      <span>
                        <b>{x.t}</b>
                        <small>{x.m}</small>
                      </span>
                      <Icon name="ArrowRight" size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <div className="goal-detail">
            <section className="rise" style={{ '--i': 2 } as CSSProperties}>
              <h2 className="h-sec">Competências do objetivo</h2>
              <div className="skill-split">
                <div>
                  <p className="eyebrow">Você já tem</p>
                  <ul className="gs-list ok">
                    {has.map((sk) => (
                      <li key={sk}>
                        <Icon name="CircleCheck" size={16} />
                        {sk}
                      </li>
                    ))}
                    {!has.length && <li className="muted">Nenhuma ainda.</li>}
                  </ul>
                </div>
                <div>
                  <p className="eyebrow">Para desenvolver</p>
                  <ul className="gs-list">
                    {missing.map((sk) => (
                      <li key={sk}>
                        <Icon name="Circle" size={16} />
                        {sk}
                      </li>
                    ))}
                    {!missing.length && <li className="muted">Tudo registrado.</li>}
                  </ul>
                </div>
              </div>
            </section>

            <section className="rise" style={{ '--i': 3 } as CSSProperties}>
              <h2 className="h-sec">Cursos recomendados</h2>
              <ul className="goal-courses">
                {courses.map((c) => {
                  const st = d.courseStats[c.id]
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => router.push('/cursos/' + c.id)}>
                        <CourseArt course={c} ratio="1 / 1" className="gc-art" />
                        <span>
                          <b>{c.title}</b>
                          <small>
                            {st.complete ? 'Concluído' : st.started ? `Em andamento · ${st.pct}%` : `${c.hours} h · ${c.level}`}
                          </small>
                        </span>
                        <Icon name="ArrowRight" size={16} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="rise" style={{ '--i': 4 } as CSSProperties}>
              <h2 className="h-sec">Projetos sugeridos</h2>
              <ul className="goal-projects">
                {goal.projects.map((p) => (
                  <li key={p}>
                    <Icon name="FolderKanban" size={16} />
                    {p}
                  </li>
                ))}
              </ul>
              <Button variant="quiet" size="sm" icon="Plus" onClick={() => router.push('/projetos/novo')}>
                Registrar um projeto
              </Button>
            </section>
          </div>
        </>
      )}

      <section className="goal-pick">
        <h2 className="h-sec">Escolher objetivos</h2>
        <p className="muted">Um objetivo principal orienta as recomendações. Você pode acompanhar até dois secundários.</p>
        <div className="goal-grid">
          {catalog.goals.map((g) => {
            const primary = s.goals.primary === g.id
            const secondary = s.goals.secondary.includes(g.id)
            return (
              <div key={g.id} className={'goal-card' + (primary ? ' primary' : secondary ? ' secondary' : '')}>
                <Icon name={GOAL_ICONS[g.id] || 'Target'} size={22} />
                <b>{g.title}</b>
                <small>{g.blurb}</small>
                <div className="goal-card-actions">
                  {primary ? (
                    <span className="goal-badge">Principal</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => {
                        a.setGoal(g.id)
                        toast(`Objetivo principal: ${g.title}.`, 'ok')
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      Tornar principal
                    </Button>
                  )}
                  {!primary && (
                    <button
                      type="button"
                      className={'link-btn' + (secondary ? ' on' : '')}
                      aria-pressed={secondary}
                      onClick={() => a.toggleSecondaryGoal(g.id)}
                    >
                      {secondary ? 'Acompanhando' : 'Acompanhar'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
