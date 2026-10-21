'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { categoryOf, findCourse, lessonsOf } from '@/lib/domain/catalog'
import { GOAL_ICONS } from '@/lib/goal-icons'
import type { Course } from '@/lib/types'


const STAGES: { value: string; label: string; icon: IconName }[] = [
  { value: 'Estudante do ensino médio', label: 'Estou no ensino médio', icon: 'BookOpen' },
  { value: 'Estudante de graduação ou curso técnico', label: 'Estou na faculdade ou em curso técnico', icon: 'GraduationCap' },
  { value: 'Em busca da primeira oportunidade', label: 'Já me formei e busco a primeira oportunidade', icon: 'Rocket' },
  { value: 'Profissional em desenvolvimento', label: 'Já trabalho e quero crescer ou mudar de área', icon: 'Briefcase' },
]

const PACES = [
  { value: 2, label: 'Pouco', detail: 'cerca de 30 min por semana' },
  { value: 4, label: 'Moderado', detail: 'cerca de 1 hora por semana' },
  { value: 8, label: 'Intenso', detail: '2 horas ou mais por semana' },
]

const TITLES = ['Qual é o seu objetivo agora?', 'Em que momento você está?', 'Seu ponto de partida']

/** Primeiro acesso: 3 passos para escolher objetivo, momento e ritmo. */
export function OnboardingView() {
  const { s, a, catalog } = useApp()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [goalId, setGoalId] = useState<string | null>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [pace, setPace] = useState(4)
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    title.current?.focus()
    window.scrollTo(0, 0)
  }, [step])

  const goal = catalog.goals.find((g) => g.id === goalId)
  const goalCourses = goal ? goal.courses.map((id) => findCourse(catalog, id)).filter((c): c is Course => !!c) : []
  const firstCourse = goalCourses[0]
  const firstLesson = firstCourse ? lessonsOf(firstCourse)[0] : null

  const finish = (to: 'aula' | string) => {
    if (!goalId || !stage) return
    a.completeOnboarding({ goal: goalId, stage, weekly: pace })
    if (to === 'aula' && firstCourse && firstLesson) {
      a.openLesson(firstCourse.id, firstLesson.id)
      router.replace(`/aula/${firstCourse.id}/${firstLesson.id}`)
    } else router.replace(to)
  }

  const canGo = step === 0 ? !!goalId : step === 1 ? !!stage : true

  return (
    <div className="onb surface-paper">
      <header className="onb-top">
        <Wordmark height={34} tone="indigo" text="var(--ink)" />
        <div className="onb-steps" aria-label={`Passo ${step + 1} de 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
          <small>Passo {step + 1} de 3</small>
        </div>
      </header>

      <main className="onb-main">
        <p className="eyebrow">{step === 0 ? `Boas-vindas, ${s.user.first}` : step === 1 ? 'Sobre você' : 'Tudo pronto'}</p>
        <h1 ref={title} tabIndex={-1} className="onb-title">
          {TITLES[step]}
        </h1>

        {step === 0 && (
          <>
            <p className="lead">
              Isso define os cursos, projetos e competências que vamos sugerir. Você pode mudar depois em Objetivos.
            </p>
            <div className="onb-goals" role="radiogroup" aria-label="Objetivo">
              {catalog.goals.map((g) => (
                <label key={g.id} className={'onb-goal' + (goalId === g.id ? ' on' : '')}>
                  <input type="radio" name="goal" value={g.id} checked={goalId === g.id} onChange={() => setGoalId(g.id)} />
                  <span className="onb-goal-ico">
                    <Icon name={GOAL_ICONS[g.id] || 'Target'} size={20} />
                  </span>
                  <span className="onb-goal-t">
                    <b>{g.title}</b>
                    <small>{g.blurb}</small>
                  </span>
                  <span className="onb-check" aria-hidden="true">
                    <Icon name="Check" size={14} />
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="onb-stages" role="radiogroup" aria-label="Momento atual">
              {STAGES.map((st) => (
                <label key={st.value} className={'onb-stage' + (stage === st.value ? ' on' : '')}>
                  <input
                    type="radio"
                    name="stage"
                    value={st.value}
                    checked={stage === st.value}
                    onChange={() => setStage(st.value)}
                  />
                  <Icon name={st.icon} size={20} />
                  <b>{st.label}</b>
                  <span className="onb-check" aria-hidden="true">
                    <Icon name="Check" size={14} />
                  </span>
                </label>
              ))}
            </div>
            <h2 className="onb-sub">Quanto tempo você quer dedicar por semana?</h2>
            <div className="onb-paces" role="radiogroup" aria-label="Ritmo semanal">
              {PACES.map((p) => (
                <label key={p.value} className={'onb-pace' + (pace === p.value ? ' on' : '')}>
                  <input type="radio" name="pace" checked={pace === p.value} onChange={() => setPace(p.value)} />
                  <b>{p.label}</b>
                  <small>{p.detail}</small>
                  <em>Meta de {p.value} aulas</em>
                </label>
              ))}
            </div>
          </>
        )}

        {step === 2 && goal && !firstCourse && (
          <div className="onb-plan">
            <p className="lead">
              Ainda não há cursos publicados para <b>{goal.title.toLowerCase()}</b>. Você pode explorar o catálogo enquanto
              novos cursos chegam.
            </p>
            <div className="onb-first-actions">
              <Button variant="go" onClick={() => finish('/cursos')}>
                Explorar cursos
              </Button>
            </div>
          </div>
        )}

        {step === 2 && goal && firstCourse && (
          <div className="onb-plan">
            <p className="lead">
              Montamos um caminho para <b>{goal.title.toLowerCase()}</b>, com meta de {pace} aulas por semana.
            </p>
            <section className="onb-first">
              <CourseArt course={firstCourse} ratio="4 / 3" className="onb-first-art" big />
              <div className="onb-first-body">
                <p className="eyebrow">Primeiro curso recomendado · {categoryOf(catalog, firstCourse.cat).name}</p>
                <h2>{firstCourse.title}</h2>
                <p className="muted">{firstCourse.summary}</p>
                <p className="onb-meta">
                  <span>
                    <Icon name="Gauge" size={15} />
                    {firstCourse.level}
                  </span>
                  <span>
                    <Icon name="Clock" size={15} />
                    {firstCourse.hours} h
                  </span>
                  <span>
                    <Icon name="FolderKanban" size={15} />
                    Termina com um projeto prático
                  </span>
                </p>
                <div className="onb-first-actions">
                  <Button variant="go" icon="Play" onClick={() => finish('aula')}>
                    Começar a primeira aula
                  </Button>
                  <Button variant="quiet" onClick={() => finish('/cursos/' + firstCourse.id)}>
                    Ver o curso
                  </Button>
                </div>
              </div>
            </section>
            <div className="onb-cols">
              <section>
                <h3 className="h-sec">Competências que esse objetivo pede</h3>
                <ul className="chips">
                  {goal.skills.map((sk) => (
                    <li key={sk} className="chip">
                      {sk}
                    </li>
                  ))}
                </ul>
              </section>
              {goalCourses.length > 1 && (
                <section>
                  <h3 className="h-sec">Depois, siga com</h3>
                  <ol className="onb-next">
                    {goalCourses.slice(1, 4).map((c) => (
                      <li key={c.id}>
                        <b>{c.title}</b>
                        <small>
                          {c.level} · {c.hours} h
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="onb-foot">
        {step > 0 ? (
          <Button variant="quiet" icon="ArrowLeft" onClick={() => setStep(step - 1)}>
            Voltar
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button variant="primary" iconRight="ArrowRight" disabled={!canGo} onClick={() => setStep(step + 1)}>
            Continuar
          </Button>
        ) : (
          <Button variant="quiet" iconRight="ArrowRight" onClick={() => finish('/inicio')}>
            Ir para o início
          </Button>
        )}
      </footer>
    </div>
  )
}
