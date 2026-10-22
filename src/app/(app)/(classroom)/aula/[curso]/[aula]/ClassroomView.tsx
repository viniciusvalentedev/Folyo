'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { MarkPath } from '@/components/brand/Logo'
import { lessonNumber } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Progress, Ring, StatusPill } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { findCourse, lessonsOf } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { Course, LessonRef } from '@/lib/types'

const NOTE_MAX = 5000
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`

/**
 * Player DEMONSTRATIVO: simula o vídeo com um slide e uma barra de progresso.
 * Na etapa do vídeo, entra aqui o player do Cloudflare Stream ou do Bunny Stream.
 */
function DemoPlayer({ lesson, n }: { lesson: LessonRef; n: number }) {
  const { s, a } = useApp()
  const total = lesson.min * 60
  const [pos, setPos] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [muted, setMuted] = useState(false)
  const captions = s.settings.captions

  const lines = useMemo(() => {
    const parts = (lesson.desc || `Nesta aula você estuda ${lesson.title.toLowerCase()} com exemplos aplicados.`).split(
      /(?<=\.)\s+/,
    )
    return parts.length ? parts : [lesson.title]
  }, [lesson])

  useEffect(() => {
    if (!playing) return
    const t = setInterval(() => {
      setPos((p) => {
        const next = p + 0.5 * speed
        if (next >= total) {
          setPlaying(false)
          return total
        }
        return next
      })
    }, 500)
    return () => clearInterval(t)
  }, [playing, speed, total])

  const seek = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPos(Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total)))
  }
  const caption = lines[Math.min(lines.length - 1, Math.floor((pos / total) * lines.length))]
  const speeds = [1, 1.25, 1.5, 2]

  return (
    <div className={'player' + (playing ? ' playing' : '')}>
      <div className="player-stage" onClick={() => setPlaying(!playing)}>
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
        <span className="player-demo">Player demonstrativo · sem vídeo real</span>
        {!playing && (
          <span className="player-big">
            <Icon name="Play" size={30} />
          </span>
        )}
        {captions && pos > 0 && <p className="player-cc">{caption}</p>}
      </div>
      <div className="player-bar">
        <IconButton icon={playing ? 'Pause' : 'Play'} label={playing ? 'Pausar' : 'Reproduzir'} onClick={() => setPlaying(!playing)} />
        <IconButton icon="RotateCcw" label="Voltar 10 segundos" onClick={() => setPos((p) => Math.max(0, p - 10))} />
        <span className="player-time">
          {clock(pos)} / {clock(total)}
        </span>
        <div
          className="scrub"
          role="slider"
          tabIndex={0}
          aria-label="Posição do vídeo"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={clock(pos)}
          onClick={seek}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setPos((p) => Math.min(total, p + 10))
            if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 10))
          }}
        >
          <span className="scrub-fill" style={{ width: `${(pos / total) * 100}%` }} />
          <span className="scrub-knob" style={{ left: `${(pos / total) * 100}%` }} />
        </div>
        <button
          type="button"
          className="player-speed"
          onClick={() => setSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length])}
          aria-label={`Velocidade ${speed}x`}
        >
          {speed}×
        </button>
        <IconButton
          icon="Captions"
          label={captions ? 'Desativar legendas' : 'Ativar legendas'}
          className={captions ? 'on' : ''}
          onClick={() => a.setSetting('captions', !captions)}
        />
        <IconButton icon={muted ? 'VolumeX' : 'Volume2'} label={muted ? 'Ativar som' : 'Silenciar'} onClick={() => setMuted(!muted)} />
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

export function ClassroomView({ courseId, lessonId }: { courseId: string; lessonId: string }) {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const course = findCourse(catalog, courseId) as Course | undefined
  const lessons = course ? lessonsOf(course) : []
  const index = lessons.findIndex((l) => l.id === lessonId)
  const lesson = lessons[index]
  const [tab, setTab] = useState<Tab>('sobre')
  const [focus, setFocus] = useState(false)
  const [celebrate, setCelebrate] = useState<null | 'cert' | 'lessons'>(null)
  const [justDone, setJustDone] = useState(false)

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
  const project = st.project
  const n = lessonNumber(course, lesson.id)
  const go = (l?: LessonRef) => l && router.push(`/aula/${course.id}/${l.id}`)

  const toggleDone = () => {
    if (done) {
      a.toggleLesson(lesson.id)
      toast('Aula marcada como não concluída.', 'info')
      return
    }
    a.toggleLesson(lesson.id)
    setJustDone(true)
    const count = st.done + 1
    const pct = Math.round((count / st.total) * 100)
    if (count === st.total) setCelebrate(project?.status === 'concluido' ? 'cert' : 'lessons')
    else
      toast(`${course.title} agora está em ${pct}%.`, 'ok', {
        title: 'Aula concluída',
        actionLabel: next ? 'Próxima aula' : undefined,
        onAction: () => go(next),
      })
  }

  const openProject = () => {
    if (project) router.push('/projetos/' + project.id)
    else {
      const pid = a.ensureCourseProject(course.id)
      if (pid) router.push('/projetos/' + pid)
    }
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
          <DemoPlayer key={lesson.id} lesson={lesson} n={n} />
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
                className={justDone && done ? 'pop' : ''}
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
              <div className="class-project">
                <div>
                  <p className="eyebrow">Aplique esta aula</p>
                  <h3>{project ? project.title : course.project.title}</h3>
                  <p className="muted">{course.project.brief}</p>
                  {project && (
                    <div className="row gap-s">
                      <StatusPill status={project.status} />
                      <small className="muted">
                        {project.steps.filter((x) => x.done).length} de {project.steps.length} etapas
                      </small>
                    </div>
                  )}
                </div>
                <Button variant="primary" iconRight="ArrowRight" onClick={openProject}>
                  {project ? 'Abrir projeto' : 'Começar projeto'}
                </Button>
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
          <button type="button" className="side-project" onClick={openProject}>
            <Icon name="FolderKanban" size={18} />
            <span>
              <small>Projeto final</small>
              <b>{project ? project.title : course.project.title}</b>
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
        title={celebrate === 'cert' ? 'Curso concluído' : 'Todas as aulas concluídas'}
        footer={
          celebrate === 'cert' ? (
            <>
              <Button variant="quiet-dark" onClick={() => setCelebrate(null)}>
                Fechar
              </Button>
              <Button
                variant="go"
                onClick={() => {
                  setCelebrate(null)
                  router.push('/certificados')
                }}
              >
                Ver certificado
              </Button>
            </>
          ) : (
            <>
              <Button variant="quiet-dark" onClick={() => setCelebrate(null)}>
                Depois
              </Button>
              <Button
                variant="go"
                onClick={() => {
                  setCelebrate(null)
                  openProject()
                }}
              >
                Ir para o projeto
              </Button>
            </>
          )
        }
      >
        <div className="celebrate">
          <svg viewBox="0 0 120 120" width="96" height="96" aria-hidden="true" className="celebrate-mark">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--lime)" strokeWidth="6" strokeLinecap="round" className="draw" />
            <MarkPath x={60} y={60} r={22} fill="var(--lime)" />
          </svg>
          {celebrate === 'cert' ? (
            <p>
              Você concluiu as {st.total} aulas e o projeto de <b>{course.title}</b>. O certificado demonstrativo já está na
              sua área de certificados.
            </p>
          ) : (
            <p>
              Você concluiu as {st.total} aulas de <b>{course.title}</b>. Para receber o certificado, finalize o projeto
              prático.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
