'use client'

import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { FavButton, lessonNumber } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Ring, StatusPill } from '@/components/ui/indicators'
import { useBack } from '@/components/ui/PageHead'
import { categoryOf, findCourse, lessonsOf } from '@/lib/domain/catalog'
import { formatDate, formatMinutes, plural } from '@/lib/format'

export function CourseView({ id }: { id: string }) {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const back = useBack()
  const course = findCourse(catalog, id)
  const [open, setOpen] = useState(() => new Set([0, 1, 2]))

  if (!course) {
    return (
      <div className="page surface-paper">
        <EmptyState icon="SearchX" title="Curso não encontrado" action={<Button onClick={() => router.push('/cursos')}>Explorar cursos</Button>}>
          Ele pode ter sido despublicado ou removido do catálogo.
        </EmptyState>
      </div>
    )
  }

  const st = d.courseStats[course.id]
  const project = st.project
  const minutes = lessonsOf(course).reduce((sum, l) => sum + l.min, 0)

  const start = () => {
    const lesson = st.resume
    a.openLesson(course.id, lesson.id)
    if (!st.started) toast(`Curso iniciado: ${course.title}.`, 'ok')
    router.push(`/aula/${course.id}/${lesson.id}`)
  }

  const openProject = () => {
    if (project) {
      router.push('/projetos/' + project.id)
      return
    }
    const pid = a.ensureCourseProject(course.id)
    if (pid) {
      toast('Projeto criado. As etapas já estão na sua central de projetos.', 'ok')
      router.push('/projetos/' + pid)
    }
  }

  const toggleModule = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const steps = project ? project.steps : course.project.steps.map((title, i) => ({ id: String(i), title, done: false }))

  return (
    <div className="page course-page">
      <section className={'course-hero tone-' + course.tone}>
        <div className="course-hero-in">
          <button type="button" className="backlink on-dark" onClick={() => back('/cursos')}>
            <Icon name="ArrowLeft" size={16} />
            Voltar
          </button>
          <div className="course-hero-grid">
            <div className="rise">
              <p className="eyebrow">
                {categoryOf(catalog, course.cat).name}
                {course.plan === 'free' ? ' · Gratuito' : ' · Plano Pro'}
              </p>
              <h1 className="display">{course.title}</h1>
              <p className="lead">{course.summary}</p>
              <ul className="course-facts">
                <li>
                  <Icon name="Gauge" size={16} />
                  {course.level}
                </li>
                <li>
                  <Icon name="Clock" size={16} />
                  {formatMinutes(minutes)} de aula · {course.hours} h com o projeto
                </li>
                <li>
                  <Icon name="Layers" size={16} />
                  {plural(course.modules.length, 'módulo', 'módulos')} · {plural(st.total, 'aula', 'aulas')}
                </li>
                <li>
                  <Icon name="Award" size={16} />
                  Certificado ao concluir aulas e projeto
                </li>
              </ul>
              <div className="row gap-s wrap">
                <Button variant="go" icon={st.complete ? 'RotateCcw' : 'Play'} onClick={start}>
                  {st.complete
                    ? 'Revisar aulas'
                    : st.started
                      ? `Continuar · Aula ${lessonNumber(course, st.resume.id)}`
                      : 'Começar curso'}
                </Button>
                <Button variant="ghost-on-dark" icon="FolderKanban" onClick={openProject}>
                  {project ? 'Abrir projeto' : 'Ver projeto prático'}
                </Button>
                <FavButton cid={course.id} light />
              </div>
            </div>
            <div className="course-hero-side rise" style={{ '--i': 1 } as CSSProperties}>
              <Ring
                value={st.pct}
                size={132}
                stroke={10}
                tone="var(--lime)"
                track="var(--ring-track-dark)"
                label={`${st.pct}% do curso`}
              >
                <b className="ring-big">{st.pct}%</b>
                <small>
                  {st.done}/{st.total} aulas
                </small>
              </Ring>
              <p className="muted-on-dark">
                {st.complete
                  ? `Aulas concluídas em ${formatDate(st.completedAt)}`
                  : st.started
                    ? `${formatMinutes(st.minutesLeft)} restantes`
                    : 'Ainda não iniciado'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="surface-paper course-body">
        <div className="course-cols">
          <div className="course-main">
            <section className="rise">
              <h2 className="h-sec">Ao final, você vai conseguir</h2>
              <ol className="outcomes">
                {course.outcomes.map((o, i) => (
                  <li key={o}>
                    <span className="oc-n">{i + 1}</span>
                    {o}
                  </li>
                ))}
              </ol>
            </section>

            <section className="rise" style={{ '--i': 1 } as CSSProperties}>
              <div className="section-head">
                <h2 className="h-sec">Estrutura do curso</h2>
                <span className="muted">
                  {st.done} de {st.total} aulas concluídas
                </span>
              </div>
              <div className="modules">
                {course.modules.map((m, mi) => {
                  const done = m.lessons.filter((l) => s.completed[l.id]).length
                  const isOpen = open.has(mi)
                  return (
                    <div key={m.id} className={'module' + (isOpen ? ' open' : '')}>
                      <button
                        type="button"
                        className="module-head"
                        aria-expanded={isOpen}
                        onClick={() => toggleModule(mi)}
                      >
                        <span className="module-n">Módulo {mi + 1}</span>
                        <b>{m.title}</b>
                        <span className="module-count">
                          {done}/{m.lessons.length}
                        </span>
                        <Icon name="ChevronDown" size={18} className="chev" />
                      </button>
                      <div className="module-body">
                        <ul>
                          {m.lessons.map((l) => {
                            const isDone = !!s.completed[l.id]
                            const isNext = st.resume?.id === l.id && !st.complete
                            return (
                              <li key={l.id}>
                                <button
                                  type="button"
                                  className={'lesson-line' + (isDone ? ' done' : '') + (isNext ? ' next' : '')}
                                  onClick={() => {
                                    a.openLesson(course.id, l.id)
                                    router.push(`/aula/${course.id}/${l.id}`)
                                  }}
                                >
                                  <span className="ll-ico">
                                    {isDone ? (
                                      <Icon name="Check" size={14} />
                                    ) : isNext ? (
                                      <Icon name="Play" size={12} />
                                    ) : (
                                      <span className="ll-dot" />
                                    )}
                                  </span>
                                  <span className="ll-n">{lessonNumber(course, l.id)}</span>
                                  <span className="ll-t">{l.title}</span>
                                  {isNext && <span className="ll-tag">Próxima</span>}
                                  <span className="ll-min">{l.min} min</span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <aside className="course-side">
            <section className="project-brief rise" style={{ '--i': 2 } as CSSProperties}>
              <p className="eyebrow">Projeto prático final</p>
              <h3>{course.project.title}</h3>
              <p>{course.project.brief}</p>
              {course.project.expected && (
                <div className="pb-expected">
                  <small>Resultado esperado</small>
                  <p>{course.project.expected}</p>
                </div>
              )}
              <ol className="pb-steps">
                {steps.map((step, i) => (
                  <li key={step.id} className={step.done ? 'done' : ''}>
                    <span>{step.done ? <Icon name="Check" size={13} /> : i + 1}</span>
                    {step.title}
                  </li>
                ))}
              </ol>
              {project && (
                <div className="pb-status">
                  <StatusPill status={project.status} />
                  {project.status !== 'concluido' && (
                    <small>
                      {project.steps.filter((x) => x.done).length} de {project.steps.length} etapas
                    </small>
                  )}
                </div>
              )}
              <Button variant="primary" iconRight="ArrowRight" onClick={openProject} className="w-full">
                {project ? (project.status === 'concluido' ? 'Ver projeto' : 'Continuar projeto') : 'Começar projeto'}
              </Button>
            </section>

            <section className="cert-req rise" style={{ '--i': 3 } as CSSProperties}>
              <p className="eyebrow">Certificado</p>
              {st.certified ? (
                <>
                  <p className="cert-ok">
                    <Icon name="BadgeCheck" size={18} />
                    Emitido em {formatDate(st.certDate)}
                  </p>
                  <Button variant="quiet" onClick={() => router.push('/certificados')}>
                    Ver certificado
                  </Button>
                </>
              ) : (
                <ul className="req">
                  <li className={st.complete ? 'ok' : ''}>
                    <Icon name={st.complete ? 'CircleCheck' : 'Circle'} size={16} />
                    Concluir as {st.total} aulas{' '}
                    <small>
                      {st.done}/{st.total}
                    </small>
                  </li>
                  <li className={project?.status === 'concluido' ? 'ok' : ''}>
                    <Icon name={project?.status === 'concluido' ? 'CircleCheck' : 'Circle'} size={16} />
                    Finalizar o projeto prático
                  </li>
                </ul>
              )}
            </section>

            <section className="rise" style={{ '--i': 4 } as CSSProperties}>
              <p className="eyebrow">Competências desenvolvidas</p>
              <div className="chips">
                {course.skills.map((sk) => (
                  <span key={sk} className="chip-static">
                    {sk}
                  </span>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
