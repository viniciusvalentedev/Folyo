'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { MarkPath } from '@/components/brand/Logo'
import { lessonNumber } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Progress, Ring } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { WorksPanel } from '@/components/works/WorksPanel'
import { findCourse, lessonsOf } from '@/lib/domain/catalog'
import { issuesCertificate } from '@/lib/domain/derive'
import { plural } from '@/lib/format'
import { NOTE_MAX } from '@/lib/validation'
import type { Course, LessonRef } from '@/lib/types'

/**
 * Espaço do vídeo. O vídeo de cada aula (e o tempo assistido) entra com o painel da equipe,
 * na etapa de mídia; até lá o aluno vê o resumo da aula e os materiais.
 */
function LessonPlayer({ lesson, n }: { lesson: LessonRef; n: number }) {
  return (
    <div className="player">
      <div className="player-stage">
        <div className="slide">
          <p className="slide-k">
            Módulo {lesson.mi + 1} · Aula {n}
          </p>
          <h2 className="slide-t">{lesson.title}</h2>
          <svg className="slide-art" viewBox="0 0 200 200" aria-hidden="true">
            <MarkPath x={150} y={90} r={120} fill="rgba(255,255,255,.07)" rotate={-8} />
            <MarkPath x={182} y={170} r={14} fill="var(--lime)" />
          </svg>
        </div>
        <p className="player-none" role="status">
          <Icon name="VideoOff" size={18} />O vídeo desta aula ainda não está disponível. Você pode ler a descrição e os
          materiais abaixo.
        </p>
      </div>
    </div>
  )
}

/** Anotações da aula. Cada letra vai para a fila de gravação, que salva quando a pessoa para de digitar. */
function Notes({ lid }: { lid: string }) {
  const { s, a, isSaving } = useApp()
  const [text, setText] = useState(s.notes[lid] || '')
  const saved = !isSaving('note:' + lid)
  const change = (v: string) => {
    setText(v)
    a.setNote(lid, v)
  }
  return (
    <div className="notes">
      <label htmlFor={'note-' + lid} className="sr-only">
        Anotações da aula
      </label>
      <textarea
        id={'note-' + lid}
        value={text}
        maxLength={NOTE_MAX}
        onChange={(e) => change(e.target.value)}
        placeholder="Escreva o que quer lembrar desta aula."
        rows={6}
      />
      <p className="notes-status">
        {saved ? (
          <>
            <Icon name="Check" size={13} />
            Salvo
          </>
        ) : (
          'Salvando…'
        )}
        <span>
          {text.length} / {NOTE_MAX} caracteres
        </span>
      </p>
    </div>
  )
}

type Tab = 'sobre' | 'material' | 'notas' | 'projeto'
type Celebration = null | 'cert' | 'lessons' | 'done'

export function ClassroomView({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const course = findCourse(catalog, courseId) as Course | undefined
  const lessons = course ? lessonsOf(course) : []
  const index = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[index]
  const [tab, setTab] = useState<Tab>('sobre')
  const [focus, setFocus] = useState(false)
  const [celebrate, setCelebrate] = useState<Celebration>(null)
  // Guarda QUAL aula acabou de ser concluída (a animação não repete ao trocar de aula).
  const [justDone, setJustDone] = useState<string | null>(null)

  // Ao abrir a aula, registra como "última aula vista" do curso.
  useEffect(() => {
    if (course && lesson) a.openLesson(course.id, lesson.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  if (!course || !lesson) {
    return (
      <div className="page surface-ink">
        <EmptyState icon="SearchX" title="Aula não encontrada" action={<Button onClick={() => router.push('/cursos')}>Explorar cursos</Button>} />
      </div>
    )
  }

  const st = d.courseStats[course.id]
  const prev = lessons[index - 1]
  const next = lessons[index + 1]
  const done = !!s.completed[lesson.id]
  const n = lessonNumber(course, lesson.id)
  const hasProject = !!course.project?.title
  const pendingProject = st.offersProject && !st.delivered
  const go = (l?: LessonRef) => l && router.push(`/aula/${course.id}/${l.id}`)

  const toggleDone = () => {
    if (done) {
      a.toggleLesson(lesson.id)
      toast('Aula marcada como não concluída.', 'info')
      return
    }
    a.toggleLesson(lesson.id)
    setJustDone(lesson.id)
    const count = st.done + 1
    const pct = Math.round((count / st.total) * 100)
    if (count === st.total) setCelebrate(pendingProject ? 'lessons' : issuesCertificate(course) ? 'cert' : 'done')
    else
      toast(`${course.title} agora está em ${pct}%.`, 'ok', {
        title: 'Aula concluída',
        actionLabel: next ? 'Próxima aula' : undefined,
        onAction: () => go(next),
      })
  }

  const goToProject = () => {
    setTab('projeto')
    setTimeout(() => document.querySelector('.class-tab')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  return (
    <div className={'page surface-ink classroom' + (focus ? ' focus' : '')}>
      <header className="class-top">
        <button type="button" className="backlink on-dark" onClick={() => router.push('/cursos/' + course.id)}>
          <Icon name="ArrowLeft" size={16} />
          <span>{course.title}</span>
        </button>
        <div className="class-top-prog">
          <Progress value={st.pct} size="sm" label="Progresso do curso" />
          <span>{st.pct}%</span>
        </div>
        <button
          type="button"
          className={'chip-toggle' + (focus ? ' on' : '')}
          aria-pressed={focus}
          onClick={() => setFocus(!focus)}
        >
          <Icon name={focus ? 'Minimize2' : 'Maximize2'} size={15} />
          Modo foco
        </button>
      </header>

      <div className="class-grid">
        <div className="class-main">
          <LessonPlayer key={lesson.id} lesson={lesson} n={n} />
          <div className="class-titlebar">
            <div>
              <p className="eyebrow">
                Módulo {lesson.mi + 1} · {lesson.module}
              </p>
              <h1>{lesson.title}</h1>
            </div>
            <div className="class-actions">
              <IconButton icon="ChevronLeft" label="Aula anterior" disabled={!prev} onClick={() => go(prev)} />
              <Button
                variant={done ? 'done' : 'go'}
                icon={done ? 'CircleCheck' : 'Check'}
                onClick={toggleDone}
                className={justDone === lesson.id && done ? 'pop' : ''}
              >
                {done ? 'Concluída' : 'Marcar como concluída'}
              </Button>
              <Button variant={done ? 'primary' : 'quiet-dark'} iconRight="ChevronRight" disabled={!next} onClick={() => go(next)}>
                Próxima aula
              </Button>
            </div>
          </div>

          <Tabs
            label="Conteúdo da aula"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'sobre', label: 'Sobre a aula', icon: 'Info' },
              { value: 'material', label: 'Material', icon: 'Paperclip' },
              { value: 'notas', label: 'Anotações', icon: 'StickyNote', badge: s.notes[lesson.id] ? '1' : null },
              { value: 'projeto', label: 'Projeto do curso', icon: 'FolderKanban' },
            ]}
          />
          <div className="class-tab" key={tab}>
            {tab === 'sobre' && (
              <div className="prose">
                <p>
                  {lesson.desc ||
                    `Nesta aula de ${lesson.min} minutos você estuda "${lesson.title}" com exemplos aplicados e um exercício curto para fazer em seguida.`}
                </p>
                <p className="muted">
                  Duração: {lesson.min} min · Aula {n} de {st.total}
                </p>
              </div>
            )}
            {tab === 'material' && (
              <p className="muted-on-dark class-empty">
                <Icon name="Paperclip" size={16} />
                Esta aula ainda não tem materiais complementares.
              </p>
            )}
            {tab === 'notas' && <Notes key={lesson.id} lid={lesson.id} />}
            {tab === 'projeto' && (
              <div className="class-project2">
                {hasProject ? (
                  <div className="cp2-head">
                    <p className="eyebrow">Projeto do curso</p>
                    <h3>{course.project.title}</h3>
                    {course.project.brief && <p className="muted">{course.project.brief}</p>}
                    {course.project.expected && (
                      <p className="cp2-exp">
                        <b>O que entregar:</b> {course.project.expected}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="muted">Este curso não pede um projeto específico, mas você pode anexar o que produziu.</p>
                )}
                <WorksPanel course={course} bare />
              </div>
            )}
          </div>
        </div>

        <aside className="class-side" aria-label="Aulas do curso">
          <div className="class-side-head">
            <Ring value={st.pct} size={52} stroke={5} track="var(--ring-track-dark)">
              <b className="ring-sm">{st.pct}%</b>
            </Ring>
            <div>
              <b>
                {st.done} de {st.total} aulas
              </b>
              <small>
                {st.complete ? 'Todas as aulas concluídas' : plural(st.total - st.done, 'aula restante', 'aulas restantes')}
              </small>
            </div>
          </div>
          {course.modules.map((m, mi) => (
            <div key={m.id} className="side-mod">
              <p className="side-mod-t">
                <span>Módulo {mi + 1}</span>
                {m.title}
              </p>
              <ul>
                {m.lessons.map((l) => {
                  const isDone = !!s.completed[l.id]
                  const isCur = l.id === lesson.id
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={'side-lesson' + (isDone ? ' done' : '') + (isCur ? ' cur' : '')}
                        aria-current={isCur ? 'true' : undefined}
                        onClick={() => router.push(`/aula/${course.id}/${l.id}`)}
                      >
                        <span className="sl-ico">
                          {isDone ? <Icon name="Check" size={13} /> : isCur ? <Icon name="Play" size={11} /> : lessonNumber(course, l.id)}
                        </span>
                        <span className="sl-t">{l.title}</span>
                        <span className="sl-m">{l.min}′</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <button type="button" className="side-project" onClick={goToProject}>
            <Icon name="FolderKanban" size={18} />
            <span>
              <small>{st.delivered ? 'Projeto enviado' : 'Projeto do curso'}</small>
              <b>{hasProject ? course.project.title : 'Anexar trabalho'}</b>
            </span>
            <Icon name="ArrowRight" size={16} />
          </button>
        </aside>
      </div>

      <Modal
        open={!!celebrate}
        onClose={() => setCelebrate(null)}
        tone="ink"
        size="sm"
        title={celebrate === 'lessons' ? 'Todas as aulas concluídas' : 'Curso concluído'}
        footer={
          celebrate === 'lessons' ? (
            <>
              <Button variant="quiet-dark" onClick={() => setCelebrate(null)}>
                Depois
              </Button>
              <Button
                variant="go"
                onClick={() => {
                  setCelebrate(null)
                  goToProject()
                }}
              >
                Enviar o projeto
              </Button>
            </>
          ) : (
            <>
              <Button variant="quiet-dark" onClick={() => setCelebrate(null)}>
                Fechar
              </Button>
              {celebrate === 'cert' && (
                <Button
                  variant="go"
                  onClick={() => {
                    setCelebrate(null)
                    router.push('/certificados')
                  }}
                >
                  Ver certificado
                </Button>
              )}
            </>
          )
        }
      >
        <div className="celebrate">
          <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" className="celebrate-mark">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--lime)" strokeWidth="6" strokeLinecap="round" className="draw" />
            <MarkPath x={60} y={60} r={22} fill="var(--lime)" />
          </svg>
          {celebrate === 'lessons' ? (
            <p>
              Você concluiu as {st.total} aulas de <b>{course.title}</b>. Para receber o certificado, envie o projeto do curso em
              PDF ou link.
            </p>
          ) : celebrate === 'cert' ? (
            <p>
              Você concluiu as {st.total} aulas{st.offersProject ? ' e enviou o projeto' : ''} de <b>{course.title}</b>. O
              certificado já está na sua área de certificados.
            </p>
          ) : (
            <p>
              Você concluiu as {st.total} aulas de <b>{course.title}</b>. Este curso não emite certificado, mas o que você
              aprendeu fica registrado na sua trajetória.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
