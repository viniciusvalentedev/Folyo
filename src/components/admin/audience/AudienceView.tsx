'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Seg, Select } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import type { Live, Report } from '@/lib/data/audience'
import type { Period } from '@/lib/admin/period'
import { DataTable } from '../catalog/DataTable'
import { PeriodBar } from '../PeriodBar'
import { AdminHead, Bars, fmtAgo, fmtClock, fmtDuration, fmtNum, fmtPct, Metric, Notice } from '../ui'

export type CourseMeta = { id: string; title: string; lessons: { id: string; title: string }[] }

type Props = {
  view: 'aovivo' | 'historico'
  courses: CourseMeta[]
  initialLive: Live | null
  report: Report | null
  period: Period
}

const ping = 5000
const DEVICE_ICON: Record<string, 'Smartphone' | 'Tablet' | 'Monitor'> = { celular: 'Smartphone', tablet: 'Tablet' }

export function AudienceView({ view: initialView, courses, initialLive, report, period }: Props) {
  const [view, setView] = useState(initialView)
  return (
    <div className="ad-page">
      <AdminHead
        title="Audiência"
        lead="Quem está assistindo agora e o histórico de visualizações. Tudo vem dos sinais enviados pelo player da aula (início, sinais periódicos, pausa, término e saída)."
      />
      <Seg
        label="Visão"
        value={view}
        onChange={setView}
        options={[
          { value: 'aovivo', label: 'Ao vivo', icon: 'Radio' },
          { value: 'historico', label: 'Histórico', icon: 'ChartColumn' },
        ]}
      />
      {view === 'aovivo' ? <LivePanel courses={courses} initial={initialLive} /> : <History courses={courses} report={report} period={period} />}
    </div>
  )
}

// ---------- Ao vivo ----------

function LivePanel({ courses, initial }: { courses: CourseMeta[]; initial: Live | null }) {
  const [live, setLive] = useState(initial)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => (initial ? Date.parse(initial.now) : 0))
  const [course, setCourse] = useState('all')

  // Busca de novo a cada poucos segundos enquanto a aba do navegador está visível.
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const tick = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch('/api/admin/ao-vivo', { cache: 'no-store', signal: controller.signal })
          const body = (await res.json()) as Live & { error?: string }
          if (stop) return
          if (!res.ok) setError(body.error ?? 'Não foi possível atualizar agora.')
          else {
            setLive(body)
            setNow(Date.parse(body.now))
            setError('')
          }
        } catch {
          if (!stop && !controller.signal.aborted) setError('Sem conexão. Tentando de novo…')
        }
      }
      if (!stop) timer = setTimeout(tick, ping)
    }
    timer = setTimeout(tick, initial ? ping : 0)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      stop = true
      controller.abort()
      clearTimeout(timer)
      clearInterval(clock)
    }
  }, [initial])

  const titles = useMemo(() => {
    const course = new Map(courses.map((c) => [c.id, c.title]))
    const lesson = new Map(courses.flatMap((c) => c.lessons.map((l) => [c.id + '/' + l.id, l.title] as const)))
    return { course: (id: string) => course.get(id) ?? id, lesson: (c: string, l: string) => lesson.get(c + '/' + l) ?? l }
  }, [courses])

  if (!live) return <Notice tone="err">{error || 'Não foi possível carregar a audiência agora.'}</Notice>
  const { heartbeatSec, liveTimeoutSec, activeTimeoutSec } = live.analytics

  const rows = live.sessions
    .map((s) => {
      const age = (now - Date.parse(s.lastBeat)) / 1000
      return { ...s, age, playing: s.state === 'playing' && age <= liveTimeoutSec }
    })
    .filter((s) => s.age <= activeTimeoutSec && (course === 'all' || s.courseId === course))
  const watching = rows.filter((r) => r.playing)
  const paused = rows.filter((r) => !r.playing)
  const people = new Set(rows.map((r) => r.userId)).size
  const byCourse = new Map<string, number>()
  for (const r of watching) byCourse.set(r.courseId, (byCourse.get(r.courseId) ?? 0) + 1)

  const table = rows.map((r) => ({
    ...r,
    userName: r.name || 'Conta sem nome',
    courseTitle: titles.course(r.courseId),
    lessonTitle: titles.lesson(r.courseId, r.lessonId),
    since: Math.max(0, (now - Date.parse(r.startedAt)) / 1000),
  }))

  return (
    <>
      <p className="ad-updated">
        <span className="ad-live-dot" />
        Atualiza sozinho a cada {ping / 1000} s · sinal do player a cada {heartbeatSec} s, sessão deixa de contar como “assistindo” após {liveTimeoutSec} s sem sinal
      </p>
      {error && <Notice tone="warn">{error}</Notice>}
      <section className="ad-metrics">
        <Metric icon="Radio" label="Assistindo agora" value={fmtNum(watching.length)} hint={course === 'all' ? 'sessões em reprodução' : 'neste curso'} />
        <Metric icon="Pause" label="Pausadas ou em segundo plano" value={fmtNum(paused.length)} hint={`sinal nos últimos ${activeTimeoutSec} s`} />
        <Metric icon="Users" label="Pessoas com aula aberta" value={fmtNum(people)} hint="reproduzindo ou pausadas" />
        <Metric icon="Play" label="Visualizações nas últimas 24 h" value={fmtNum(live.views24h)} />
      </section>
      <div className="ad-filters">
        <Select
          id="lv-c"
          label="Curso"
          value={course}
          onChange={setCourse}
          options={[{ value: 'all', label: 'Todos os cursos' }, ...courses.map((c) => ({ value: c.id, label: `${c.title}${byCourse.get(c.id) ? ` · ${byCourse.get(c.id)} assistindo` : ''}` }))]}
        />
      </div>
      <section className="ad-grid-2 wide-left">
        <div className="panel flush">
          <header className="ad-sec-head pad">
            <h2>Sessões ativas</h2>
            <small className="muted">
              {table.length} {table.length === 1 ? 'sessão' : 'sessões'}
            </small>
          </header>
          <DataTable
            caption="Sessões ativas"
            rows={table}
            pageSize={10}
            initialSort={{ key: 'age', dir: 'asc' }}
            columns={[
              {
                key: 'userName',
                label: 'Usuário',
                render: (r) => (
                  <Link href={`/admin/usuarios/${r.userId}`} className="ad-link">
                    {r.userName}
                  </Link>
                ),
              },
              {
                key: 'courseTitle',
                label: 'Curso e aula',
                render: (r) => (
                  <span className="ad-two">
                    <b>{r.courseTitle}</b>
                    <small>{r.lessonTitle}</small>
                  </span>
                ),
              },
              {
                key: 'playing',
                label: 'Estado',
                sortValue: (r) => (r.playing ? 1 : 0),
                render: (r) =>
                  r.playing ? (
                    <span className="ad-now">
                      <span className="ad-live-dot" />
                      Reproduzindo
                    </span>
                  ) : (
                    <span className="ad-sub">Pausada</span>
                  ),
              },
              { key: 'position', label: 'Posição', num: true, render: (r) => `${fmtClock(r.position)} / ${fmtClock(r.duration)}` },
              { key: 'since', label: 'Duração da sessão', num: true, render: (r) => fmtDuration(r.since) },
              { key: 'age', label: 'Último sinal', sortValue: (r) => r.age, render: (r) => <span className="ad-sub">{fmtAgo(r.lastBeat, now)}</span> },
              {
                key: 'device',
                label: 'Dispositivo',
                render: (r) => (
                  <span className="ad-sub">
                    <Icon name={DEVICE_ICON[r.device] ?? 'Monitor'} size={14} /> {r.device}
                  </span>
                ),
              },
            ]}
            empty={
              <div className="pad">
                <EmptyState icon="Radio" title="Ninguém assistindo agora">
                  Quando alguém der play numa aula, a sessão aparece aqui em poucos segundos.
                </EmptyState>
              </div>
            }
          />
        </div>
        <div className="panel">
          <Bars
            title="Assistindo agora por curso"
            items={[...byCourse].map(([id, value]) => ({ key: id, label: titles.course(id), value }))}
            empty="Nenhuma reprodução em andamento."
          />
        </div>
      </section>
    </>
  )
}

// ---------- Histórico ----------

function History({ courses, report, period }: { courses: CourseMeta[]; report: Report | null; period: Period }) {
  const [funnelCourse, setFunnelCourse] = useState('')
  const data = useMemo(() => {
    if (!report) return null
    const lessonInfo = new Map<string, { title: string; course: string; n: number }>()
    for (const c of courses) c.lessons.forEach((l, i) => lessonInfo.set(l.id, { title: l.title, course: c.title, n: i + 1 }))
    const byCourse = new Map(report.courses.map((c) => [c.id, c]))
    const byLesson = new Map(report.lessons.map((l) => [l.id, l]))
    const rows = courses.map((c) => {
      const r = byCourse.get(c.id)
      return {
        id: c.id,
        title: c.title,
        enrolled: r?.enrolled ?? 0,
        views: r?.views ?? 0,
        watched: r?.watched ?? 0,
        avgProgress: r?.avgProgress ?? null,
        completionRate: r && r.enrolled ? Math.round((r.completed / r.enrolled) * 1000) / 10 : null,
      }
    })
    const lessons = report.lessons
      .filter((l) => lessonInfo.has(l.id))
      .map((l) => ({ ...l, lesson: lessonInfo.get(l.id)!.title, course: lessonInfo.get(l.id)!.course, n: lessonInfo.get(l.id)!.n }))
    return { rows, lessons, byLesson }
  }, [report, courses])

  if (!report || !data) return <Notice tone="err">Não foi possível carregar o histórico agora.</Notice>

  const views = report.lessons.reduce((n, l) => n + l.views, 0)
  const done = report.lessons.reduce((n, l) => n + l.completed, 0)
  const watched = report.lessons.reduce((n, l) => n + l.watched, 0)
  const watchers = report.activity.filter((a) => a.views > 0)
  const returned = watchers.filter((a) => a.days >= 2).length

  const topCourse = funnelCourse || [...data.rows].sort((a, b) => b.views - a.views)[0]?.id || courses[0]?.id || ''
  const funnelMeta = courses.find((c) => c.id === topCourse)
  const funnel = (funnelMeta?.lessons ?? []).map((l, i) => ({ n: i + 1, title: l.title, viewers: data.byLesson.get(l.id)?.viewers ?? 0 }))
  const funnelMax = Math.max(1, ...funnel.map((f) => f.viewers))

  return (
    <>
      <PeriodBar base="/admin/audiencia" extra={{ vista: 'historico' }} period={period} />
      <section className="ad-metrics">
        <Metric icon="Play" label="Visualizações iniciadas" value={fmtNum(views)} />
        <Metric icon="CircleCheck" label="Visualizações concluídas" value={fmtNum(done)} hint={views ? `${fmtPct(Math.round((done / views) * 1000) / 10)} das iniciadas` : undefined} />
        <Metric icon="Timer" label="Tempo assistido" value={fmtDuration(watched)} />
        <Metric icon="Users" label="Pessoas que assistiram" value={fmtNum(watchers.length)} hint={`${fmtNum(returned)} ${returned === 1 ? 'voltou' : 'voltaram'} em mais de um dia`} />
      </section>

      <section className="panel flush">
        <header className="ad-sec-head pad">
          <h2>Por curso</h2>
        </header>
        <DataTable
          caption="Audiência por curso"
          rows={data.rows}
          pageSize={10}
          initialSort={{ key: 'views', dir: 'desc' }}
          columns={[
            { key: 'title', label: 'Curso', render: (r) => <b>{r.title}</b> },
            { key: 'enrolled', label: 'Matrículas', num: true, sortValue: (r) => r.enrolled, render: (r) => fmtNum(r.enrolled) },
            { key: 'views', label: 'Visualizações', num: true, sortValue: (r) => r.views, render: (r) => fmtNum(r.views) },
            { key: 'watched', label: 'Tempo assistido', num: true, sortValue: (r) => r.watched, render: (r) => fmtDuration(r.watched) },
            { key: 'avgProgress', label: 'Progresso médio', num: true, sortValue: (r) => r.avgProgress ?? -1, render: (r) => fmtPct(r.avgProgress) },
            { key: 'completionRate', label: 'Taxa de conclusão', num: true, sortValue: (r) => r.completionRate ?? -1, render: (r) => fmtPct(r.completionRate) },
          ]}
          empty={<EmptyState icon="BookOpen" title="Nenhum curso publicado ainda">Os cursos aparecem aqui depois de publicados.</EmptyState>}
        />
      </section>

      <section className="ad-grid-2">
        <div className="panel">
          <header className="ad-sec-head">
            <h2>Onde as pessoas param</h2>
            <Select id="fn-c" label="Curso" value={topCourse} onChange={setFunnelCourse} options={courses.map((c) => ({ value: c.id, label: c.title }))} />
          </header>
          <p className="ad-help">Pessoas diferentes que deram play em cada aula do curso no período. Uma queda forte entre duas aulas indica um ponto de abandono.</p>
          {funnel.some((f) => f.viewers) ? (
            <ol className="ad-funnel">
              {funnel.map((f) => (
                <li key={f.n} title={`${f.title}: ${f.viewers}`}>
                  <span className="ad-fn-n">{f.n}</span>
                  <span className="ad-bar-track">
                    <span className="ad-bar" style={{ width: `${(f.viewers / funnelMax) * 100}%` }} />
                  </span>
                  <span className="ad-bar-val">{f.viewers}</span>
                  <span className="ad-fn-t">{f.title}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ad-chart-empty">
              <Icon name="ChartColumn" size={18} />
              Nenhuma reprodução neste curso no período.
            </p>
          )}
        </div>
        <div className="panel">
          <Bars title="Aulas mais assistidas" items={data.lessons.map((l) => ({ key: l.id, label: l.lesson, value: l.views }))} max={10} empty="Nenhuma aula reproduzida no período." />
        </div>
      </section>

      <section className="panel flush">
        <header className="ad-sec-head pad">
          <h2>Aulas</h2>
          <small className="muted">alcance médio = até onde, em média, o vídeo foi assistido</small>
        </header>
        <DataTable
          caption="Audiência por aula"
          rows={data.lessons}
          pageSize={10}
          initialSort={{ key: 'views', dir: 'desc' }}
          columns={[
            {
              key: 'lesson',
              label: 'Aula',
              render: (l) => (
                <span className="ad-two">
                  <b>
                    {l.n}. {l.lesson}
                  </b>
                  <small>{l.course}</small>
                </span>
              ),
            },
            { key: 'views', label: 'Visualizações', num: true, sortValue: (l) => l.views, render: (l) => fmtNum(l.views) },
            { key: 'viewers', label: 'Pessoas', num: true, sortValue: (l) => l.viewers, render: (l) => fmtNum(l.viewers) },
            { key: 'completed', label: 'Concluídas', num: true, sortValue: (l) => l.completed, render: (l) => fmtNum(l.completed) },
            { key: 'watched', label: 'Tempo assistido', num: true, sortValue: (l) => l.watched, render: (l) => fmtDuration(l.watched) },
            { key: 'reach', label: 'Alcance médio', num: true, sortValue: (l) => l.reach ?? -1, render: (l) => fmtPct(l.reach) },
          ]}
          empty={
            <EmptyState icon="Play" title="Nenhuma aula reproduzida no período">
              Quando alguém assistir a uma aula, ela aparece aqui.
            </EmptyState>
          }
        />
      </section>
      <details className="panel ad-defs">
        <summary>
          <Icon name="CircleHelp" size={16} />
          Como cada indicador é calculado
        </summary>
        <p className="ad-help">Veja as definições completas em Relatórios.</p>
      </details>
    </>
  )
}
