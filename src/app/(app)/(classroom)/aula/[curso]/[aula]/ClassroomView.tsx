'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { MarkPath } from '@/components/brand/Logo'
import { lessonNumber } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Progress, Ring } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { useAudience } from '@/components/classroom/useAudience'
import { WorksPanel } from '@/components/works/WorksPanel'
import { findCourse, lessonsOf } from '@/lib/domain/catalog'
import { blockingIndex, followsSequence } from '@/lib/domain/sequence'
import { isExternalVideo, isHttpsUrl } from '@/lib/admin/catalog'
import { issuesCertificate } from '@/lib/domain/derive'
import { plural } from '@/lib/format'
import { formatBytes } from '@/lib/media'
import { isTrackedVideo, reachedEnd, resumePoint, shouldSavePosition } from '@/lib/watch-rules'
import { NOTE_MAX } from '@/lib/validation'
import type { Course, LessonRef } from '@/lib/types'

/** Cartaz da aula (título sobre a arte da marca), usado quando não há vídeo tocando. */
function Slide({ lesson, n }: { lesson: LessonRef; n: number }) {
  return (
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
  )
}

/** Quantos segundos assistidos juntar antes de mandar para a fila de gravação. */
const WATCH_BATCH = 5
/** Endereço de onde vem o player do Bunny (só mensagens desta origem são aceitas). */
const BUNNY_ORIGIN = 'https://iframe.mediadelivery.net'
const BUNNY_EVENTS = ['play', 'pause', 'ended', 'timeupdate'] as const

/**
 * Espaço do vídeo. Três jeitos de a aula ter vídeo:
 *  - hospedado no Bunny: o servidor gera o endereço do player com token (só depois de conferir
 *    que a pessoa pode ver a aula); o player manda play/pause/tempo e a Folyo mede a audiência;
 *  - link .mp4/.webm: toca aqui e também é medido;
 *  - YouTube/Vimeo: não tocam dentro de outro site (a Folyo não carrega iframes de terceiros
 *    além do Bunny), então a aula mostra um botão que abre o vídeo no site deles.
 * Sem vídeo (ou se falhar), aparece o aviso de vídeo indisponível.
 * A pessoa pode pular trechos à vontade; `onEnd` avisa quando o vídeo chega ao final (libera concluir a aula).
 */
function LessonPlayer({ lesson, courseId, n, embedUrl, onEnd }: { lesson: LessonRef; courseId: string; n: number; embedUrl: string | null; onEnd: () => void }) {
  const { a, s } = useApp()
  const audience = useAudience(courseId, lesson.id)
  const video = lesson.video ?? null
  const url = video?.kind === 'link' ? video.url : null
  const [failed, setFailed] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  // Soma o tempo realmente assistido (trechos pulados não contam como tempo de estudo).
  const track = useRef({ last: 0, pending: 0 })
  // Continuar de onde parou: o ponto salvo na última visita (lido uma vez, ao abrir a aula).
  const [resumeAt] = useState(() => resumePoint(s.position[lesson.id] ?? 0))
  const place = useRef({ saved: resumeAt, latest: resumeAt, duration: 0, applied: resumeAt === 0 })

  /** Guarda o ponto em que a pessoa está (aos poucos, ou na hora com `force`). Chegou ao fim = recomeça do início. */
  const remember = (current: number, duration: number, force = false) => {
    const p = place.current
    if (!Number.isFinite(current) || current < 0) return
    p.latest = current
    if (duration > 0) p.duration = duration
    const at = p.duration > 0 && reachedEnd(current, p.duration) ? 0 : resumePoint(current)
    if (!force && !shouldSavePosition(p.saved, at)) return
    p.saved = at
    a.savePosition(lesson.id, at)
  }
  // Ao sair da aula, guarda o último ponto.
  useEffect(
    () => () => {
      if (place.current.latest > 0 || place.current.saved > 0) remember(place.current.latest, place.current.duration, true)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const flush = () => {
    const t = track.current
    if (t.pending > 0) a.addWatch(lesson.id, t.pending)
    t.pending = 0
  }

  const tick = (current: number, duration: number, playing: boolean) => {
    const t = track.current
    const delta = current - t.last
    t.last = current
    audience.time(current, duration)
    if (reachedEnd(current, duration)) onEnd()
    remember(current, duration)
    if (!playing || delta <= 0 || delta > 3) return
    t.pending += delta
    if (t.pending >= WATCH_BATCH) flush()
  }

  // Player do Bunny (protocolo player.js): pede os eventos quando ele avisa que está pronto.
  const bunnyEmbed = video?.kind === 'bunny' ? embedUrl : null
  useEffect(() => {
    if (!bunnyEmbed) return
    const post = (message: Record<string, unknown>) => frame.current?.contentWindow?.postMessage(JSON.stringify({ context: 'player.js', version: '0.0.11', ...message }), BUNNY_ORIGIN)
    let duration = 0
    let playing = false
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN || e.source !== frame.current?.contentWindow || typeof e.data !== 'string') return
      let msg: { context?: string; event?: string; value?: { seconds?: number; duration?: number } }
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      if (msg.context !== 'player.js') return
      const seconds = Number(msg.value?.seconds ?? 0)
      if (Number(msg.value?.duration) > 0) duration = Number(msg.value?.duration)
      switch (msg.event) {
        case 'ready':
          for (const event of BUNNY_EVENTS) post({ method: 'addEventListener', value: event })
          break
        case 'play':
          playing = true
          track.current.last = seconds
          // Se o player não abriu no ponto salvo, leva até lá (uma vez só).
          if (!place.current.applied) {
            place.current.applied = true
            if (seconds < resumeAt - 3) post({ method: 'setCurrentTime', value: resumeAt })
          }
          audience.play()
          break
        case 'timeupdate':
          tick(seconds, duration, playing)
          break
        case 'pause':
          playing = false
          flush()
          remember(seconds, duration, true)
          audience.pause()
          break
        case 'ended':
          playing = false
          flush()
          place.current.duration = duration || place.current.duration
          remember(place.current.duration || seconds, place.current.duration, true)
          audience.end()
          onEnd()
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bunnyEmbed])

  if (video?.kind === 'bunny') {
    if (!bunnyEmbed) {
      return (
        <div className="player">
          <div className="player-stage">
            <Slide lesson={lesson} n={n} />
            <p className="player-none" role="status">
              <Icon name="VideoOff" size={18} />
              Não foi possível carregar o vídeo desta aula agora. Tente de novo mais tarde.
            </p>
          </div>
        </div>
      )
    }
    return (
      <div className="player">
        <iframe
          ref={frame}
          className="player-video player-embed"
          src={resumeAt > 0 ? `${bunnyEmbed}&t=${resumeAt}s` : bunnyEmbed}
          title={`Vídeo: ${lesson.title}`}
          loading="lazy"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    )
  }

  if (url && isExternalVideo(url) && isHttpsUrl(url)) {
    return (
      <div className="player">
        <div className="player-stage">
          <Slide lesson={lesson} n={n} />
          <p className="player-none" role="status">
            <Icon name="ExternalLink" size={18} />
            <span>Esta aula está em um vídeo hospedado fora da Folyo.</span>
            <a className="btn btn-go btn-sm" href={url} target="_blank" rel="noopener noreferrer">
              Assistir no site do vídeo
            </a>
          </p>
        </div>
      </div>
    )
  }

  if (url && isHttpsUrl(url) && !failed) {
    return (
      <div className="player">
        <video
          className="player-video"
          src={url}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={(e) => {
            const el = e.currentTarget
            if (!place.current.applied) {
              place.current.applied = true
              if (el.duration > 0 && resumeAt < el.duration - 5) el.currentTime = resumeAt
            }
          }}
          onError={() => {
            // Vídeo que não carrega não pode prender a pessoa na aula.
            setFailed(true)
            onEnd()
          }}
          onPlay={(e) => {
            track.current.last = e.currentTarget.currentTime
            audience.time(e.currentTarget.currentTime, e.currentTarget.duration)
            audience.play()
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget
            tick(el.currentTime, el.duration, !el.paused)
          }}
          onPause={(e) => {
            flush()
            remember(e.currentTarget.currentTime, e.currentTarget.duration, true)
            audience.pause()
          }}
          onEnded={(e) => {
            flush()
            remember(e.currentTarget.duration, e.currentTarget.duration, true)
            audience.end()
            onEnd()
          }}
        />
      </div>
    )
  }

  return (
    <div className="player">
      <div className="player-stage">
        <Slide lesson={lesson} n={n} />
        <p className="player-none" role="status">
          <Icon name="VideoOff" size={18} />
          {failed ? 'Não foi possível carregar o vídeo desta aula agora. Tente de novo mais tarde.' : 'O vídeo desta aula ainda não está disponível. Você pode ler a descrição e os materiais abaixo.'}
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

export function ClassroomView({ courseId, lessonId, embedUrl }: { courseId: string; lessonId: string; embedUrl: string | null }) {
  const { s, d, a, toast, catalog, isSaving } = useApp()
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
  // Guarda em QUAL aula o vídeo já chegou ao final (pular trechos é livre; concluir só no final).
  const [endedLesson, setEndedLesson] = useState<string | null>(null)

  // Trocar de aula logo depois de concluir: espera a conclusão chegar ao servidor (ele confere a sequência das aulas).
  const goAfterSave = useRef<string | null>(null)
  const savingLesson = isSaving('lesson:' + lessonId)
  useEffect(() => {
    if (goAfterSave.current && !savingLesson) {
      const to = goAfterSave.current
      goAfterSave.current = null
      router.push(to)
    }
  }, [savingLesson, router])

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
  const go = (l?: { id: string }) => {
    if (!l) return
    const to = `/aula/${course.id}/${l.id}`
    if (isSaving('lesson:' + lesson.id)) goAfterSave.current = to
    else router.push(to)
  }
  // Aulas em sequência (só aluno): uma aula só abre se todas as anteriores estiverem concluídas.
  const sequential = followsSequence(s.role)
  const blockerOf = (lessonIndex: number) =>
    sequential ? blockingIndex(lessons, lessonIndex, (id) => !!s.completed[id]) : -1
  const nextBlocked = blockerOf(index + 1) >= 0
  // Aula com vídeo que a Folyo acompanha: concluir e ir para a próxima só quando o vídeo chega ao final.
  // Aula já concluída, sem vídeo ou com vídeo de fora (YouTube/Vimeo) não trava.
  const needsEnd = isTrackedVideo(lesson.video) && !(lesson.video?.kind === 'bunny' && !embedUrl) && !done
  const atEnd = endedLesson === lesson.id
  const locked = needsEnd && !atEnd

  const toggleDone = () => {
    if (done) {
      a.toggleLesson(lesson.id)
      toast('Aula marcada como não concluída.', 'info')
      return
    }
    if (locked) {
      toast('Assista até o final do vídeo para concluir a aula.', 'info')
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
          <LessonPlayer key={lesson.id} lesson={lesson} courseId={course.id} n={n} embedUrl={embedUrl} onEnd={() => setEndedLesson(lesson.id)} />
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
                disabled={locked}
                onClick={toggleDone}
                className={justDone === lesson.id && done ? 'pop' : ''}
              >
                {done ? 'Concluída' : 'Marcar como concluída'}
              </Button>
              <Button variant={done ? 'primary' : 'quiet-dark'} iconRight="ChevronRight" disabled={!next || locked || nextBlocked} onClick={() => go(next)}>
                Próxima aula
              </Button>
            </div>
          </div>

          {needsEnd && (
            <p className={'class-gate' + (atEnd ? ' ok' : '')} role="status">
              <Icon name={atEnd ? 'CircleCheck' : 'Info'} size={16} />
              {atEnd
                ? 'Você chegou ao final do vídeo: já pode concluir a aula e ir para a próxima.'
                : 'Você pode pular trechos do vídeo, mas só conclui a aula e vai para a próxima quando chegar ao final.'}
            </p>
          )}

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
            {tab === 'material' &&
              (lesson.materials?.length ? (
                <ul className="class-materials">
                  {lesson.materials.map((m) => (
                    <li key={m.id}>
                      <a href={m.url} target="_blank" rel="noopener noreferrer">
                        <Icon name={m.file ? 'FileText' : 'Paperclip'} size={16} />
                        <span>{m.label}</span>
                        {m.file && <small>PDF · {formatBytes(m.file.size)}</small>}
                        <Icon name="ExternalLink" size={14} />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-on-dark class-empty">
                  <Icon name="Paperclip" size={16} />
                  Esta aula ainda não tem materiais complementares.
                </p>
              ))}
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
                  const blocker = blockerOf(lessons.findIndex((x) => x.id === l.id))
                  const isLocked = blocker >= 0
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        className={'side-lesson' + (isDone ? ' done' : '') + (isCur ? ' cur' : '') + (isLocked ? ' locked' : '')}
                        aria-current={isCur ? 'true' : undefined}
                        aria-disabled={isLocked || undefined}
                        onClick={() => {
                          if (isLocked) {
                            toast(`Conclua a aula ${lessonNumber(course, lessons[blocker].id)} antes de abrir esta.`, 'info')
                            return
                          }
                          go(l)
                        }}
                      >
                        <span className="sl-ico">
                          {isDone ? (
                            <Icon name="Check" size={13} />
                          ) : isCur ? (
                            <Icon name="Play" size={11} />
                          ) : isLocked ? (
                            <Icon name="Lock" size={11} />
                          ) : (
                            lessonNumber(course, l.id)
                          )}
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
            <g className="celebrate-star">
              <MarkPath x={60} y={60} r={22} fill="var(--lime)" />
            </g>
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
