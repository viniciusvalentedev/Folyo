'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useMemo, useState, type CSSProperties } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { CountUp, Seg } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Progress } from '@/components/ui/indicators'
import { formatDate, formatDayMonth, plural, todayISO, weekStart } from '@/lib/format'
import type { Derived, UserState } from '@/lib/types'
import { useNow } from '@/lib/use-now'

type Week = { start: string; n: number }
type EventKind = 'marco' | 'curso' | 'projeto' | 'certificado' | 'competencia'
type TimelineEvent = { date: string; kind: EventKind; icon: IconName; title: string; to: string; strong?: boolean }

const LEVEL_NAMES = ['Declarada', 'Aprendida', 'Praticada', 'Demonstrada']

/** Aulas concluídas por semana nas últimas 13 semanas. */
function lastWeeks(state: UserState, now: Date): Week[] {
  const thisWeek = weekStart(todayISO(now))
  const weeks: Week[] = []
  for (let i = 12; i >= 0; i--) {
    const d = new Date(thisWeek + 'T12:00:00')
    d.setDate(d.getDate() - i * 7)
    weeks.push({ start: d.toISOString().slice(0, 10), n: 0 })
  }
  for (const date of Object.values(state.completed)) {
    const w = weeks.find((x) => x.start === weekStart(date))
    if (w) w.n++
  }
  return weeks
}

/** Aulas concluídas na semana atual. */
function lessonsThisWeek(state: UserState, now: Date) {
  const start = weekStart(todayISO(now))
  return Object.values(state.completed).filter((d) => d >= start).length
}

function timeline(state: UserState, d: Derived, courses: { id: string; title: string }[]): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ date: state.user.joined, kind: 'marco', icon: 'Flag', title: 'Entrou na Folyo', to: '/perfil' }]
  for (const c of courses) {
    const st = d.courseStats[c.id]
    if (st.startedAt) ev.push({ date: st.startedAt, kind: 'curso', icon: 'Play', title: `Começou ${c.title}`, to: '/cursos/' + c.id })
    if (st.completedAt)
      ev.push({ date: st.completedAt, kind: 'curso', icon: 'BookOpen', title: `Concluiu as aulas de ${c.title}`, to: '/cursos/' + c.id })
  }
  for (const p of state.projects) {
    if (p.status === 'concluido' && p.completedAt && p.completedAt >= state.user.joined)
      ev.push({
        date: p.completedAt,
        kind: 'projeto',
        icon: 'FolderKanban',
        title: `Finalizou o projeto ${p.title}`,
        to: '/projetos/' + p.id,
        strong: true,
      })
  }
  for (const cert of d.certificates)
    ev.push({
      date: cert.date,
      kind: 'certificado',
      icon: 'Award',
      title: `Certificado demonstrativo: ${cert.course.title}`,
      to: '/certificados',
      strong: true,
    })
  const byDay: Record<string, string[]> = {}
  for (const k of state.skills) if (k.createdAt > state.user.joined) (byDay[k.createdAt] ||= []).push(k.name)
  Object.entries(byDay).forEach(([date, names]) =>
    ev.push({
      date,
      kind: 'competencia',
      icon: 'Puzzle',
      title: `Registrou ${names.length === 1 ? 'a competência' : 'as competências'} ${names.join(', ')}`,
      to: '/competencias',
    }),
  )
  return ev.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** Gráfico de barras em SVG (sem biblioteca externa). */
function WeekChart({ goal }: { goal: number }) {
  const { s } = useApp()
  const now = useNow()
  const data = lastWeeks(s, now)
  const [hover, setHover] = useState<number | null>(null)
  const W = 640
  const H = 220
  const left = 28
  const right = 8
  const top = 16
  const bottom = 30
  const max = Math.ceil(Math.max(goal, ...data.map((w) => w.n), 4) / 2) * 2
  const colW = (W - left - right) / data.length
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const last = data[data.length - 1]
  const best = data.reduce((m, w) => (w.n > m.n ? w : m), data[0])
  return (
    <>
      <div className="chart-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="chart"
          role="img"
          aria-label={`Aulas concluídas por semana nas últimas 13 semanas. Esta semana: ${last.n}.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="grid" />
              <text x={left - 8} y={y(t) + 4} className="axis" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <line x1={left} x2={W - right} y1={y(goal)} y2={y(goal)} className="goal-line" />
          <text x={W - right} y={y(goal) - 6} textAnchor="end" className="axis goal-label">
            meta {goal}/semana
          </text>
          {data.map((w, i) => {
            const x = left + i * colW + colW * 0.22
            const bw = colW * 0.56
            const isNow = i === data.length - 1
            const h = Math.max(0, y(0) - y(w.n))
            return (
              <g
                key={w.start}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`Semana de ${formatDayMonth(w.start)}: ${w.n} aulas`}
              >
                <rect x={left + i * colW} y={top} width={colW} height={H - top - bottom} fill="transparent" />
                {w.n > 0 && (
                  <path
                    d={`M${x} ${y(0)} V${y(w.n) + Math.min(4, h)} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V${y(0)} Z`}
                    className={'bar' + (isNow ? ' bar-now' : '') + (hover === i ? ' bar-hover' : '')}
                  />
                )}
                {(isNow || w === best) && (
                  <text x={x + bw / 2} y={y(w.n) - 7} textAnchor="middle" className="bar-label">
                    {w.n}
                  </text>
                )}
                {(i % 2 === 0 || isNow) && (
                  <text x={x + bw / 2} y={H - 10} textAnchor="middle" className="axis">
                    {isNow ? 'esta sem.' : formatDayMonth(w.start)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${((left + hover * colW + colW / 2) / W) * 100}%` }}>
            <small>Semana de {formatDayMonth(data[hover].start)}</small>
            <b>{plural(data[hover].n, 'aula', 'aulas')}</b>
          </div>
        )}
      </div>
      <details className="table-view">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr>
              <th>Semana</th>
              <th>Aulas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((w) => (
              <tr key={w.start}>
                <td>{formatDate(w.start)}</td>
                <td>{w.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  )
}

function WeeklyAverage() {
  const { s } = useApp()
  const weeks = lastWeeks(s, useNow())
  const avg = (weeks.slice(0, -1).reduce((sum, w) => sum + w.n, 0) / (weeks.length - 1)).toFixed(1).replace('.', ',')
  return <em>média de {avg} por semana</em>
}

function WeekGoal() {
  const { s } = useApp()
  const done = lessonsThisWeek(s, useNow())
  const goal = s.settings.weeklyGoal
  return (
    <li>
      <span className="gn-k">Semana</span>
      <b>Meta de {goal} aulas</b>
      <Progress value={(done / goal) * 100} label="Meta da semana" />
      <small>
        {done} de {goal} nesta semana
      </small>
    </li>
  )
}

export function ProgressView() {
  const { s, d, catalog } = useApp()
  const router = useRouter()
  const [filter, setFilter] = useState<'todos' | EventKind>('todos')
  const events = useMemo(() => timeline(s, d, catalog.courses), [s, d, catalog.courses])
  const started = catalog.courses.filter((c) => d.courseStats[c.id].started)
  const byLevel = [0, 1, 2, 3].map((lv) => d.skills.filter((k) => k.type !== 'idioma' && k.level === lv))
  const totalSkills = byLevel.reduce((sum, l) => sum + l.length, 0) || 1
  const shown = events.filter((e) => filter === 'todos' || e.kind === filter)
  const current = d.inProgress[0]
  const cs = current && d.courseStats[current.id]
  const goalSkillsDone = d.goal
    ? d.goal.skills.filter((sk) => s.skills.some((k) => k.name.toLowerCase() === sk.toLowerCase())).length
    : 0

  return (
    <div className="page surface-ink progress-page">
      <header className="pagehead rise">
        <p className="eyebrow">Aprenda</p>
        <h1>Meu progresso</h1>
        <p className="lead">Sua evolução desde {formatDate(s.user.joined, true)}.</p>
      </header>

      <section className="kpis rise" style={{ '--i': 1 } as CSSProperties}>
        <div className="kpi">
          <span>Cursos</span>
          <b>
            <CountUp value={d.completedCourses.length} />
            <small> concluídos</small>
          </b>
          <em>{plural(started.length, 'iniciado', 'iniciados')} no total</em>
        </div>
        <div className="kpi">
          <span>Aulas</span>
          <b>
            <CountUp value={d.lessonsDone} />
            <small> concluídas</small>
          </b>
          <Suspense fallback={<em>&nbsp;</em>}>
            <WeeklyAverage />
          </Suspense>
        </div>
        <div className="kpi">
          <span>Projetos</span>
          <b>
            <CountUp value={d.projectsDone.length} />
            <small> finalizados</small>
          </b>
          <em>{plural(s.projects.length - d.projectsDone.length, 'aberto', 'abertos')}</em>
        </div>
        <div className="kpi">
          <span>Certificados</span>
          <b>
            <CountUp value={d.certificates.length} />
          </b>
          <em>demonstrativos</em>
        </div>
        <div className="kpi">
          <span>Competências</span>
          <b>
            <CountUp value={s.skills.length} />
          </b>
          <em>{plural(byLevel[3].length, 'demonstrada', 'demonstradas')}</em>
        </div>
      </section>

      <div className="prog-grid">
        <section className="panel-dark span-2 rise" style={{ '--i': 2 } as CSSProperties}>
          <header className="panel-head">
            <div>
              <h2>Quanto você estudou</h2>
              <p className="muted-on-dark">Aulas concluídas por semana, últimas 13 semanas.</p>
            </div>
            <div className="legend">
              <span>
                <i className="sw sw-lime" />
                Aulas
              </span>
              <span>
                <i className="sw sw-goal" />
                Meta semanal
              </span>
            </div>
          </header>
          <Suspense fallback={<div className="chart-wrap" style={{ aspectRatio: '640 / 220' }} />}>
            <WeekChart goal={s.settings.weeklyGoal} />
          </Suspense>
        </section>

        <section className="panel-dark rise" style={{ '--i': 3 } as CSSProperties}>
          <header className="panel-head">
            <h2>Próximos objetivos</h2>
          </header>
          <ul className="goals-next">
            {current && cs && (
              <li>
                <span className="gn-k">Curso</span>
                <b>Concluir {current.title}</b>
                <Progress value={cs.pct} label="Progresso" />
                <small>
                  {plural(cs.total - cs.done, 'aula', 'aulas')}{' '}
                  {cs.project && cs.project.status === 'concluido' ? '' : '+ projeto final'}
                </small>
              </li>
            )}
            <Suspense fallback={null}>
              <WeekGoal />
            </Suspense>
            {d.goal && (
              <li>
                <span className="gn-k">Objetivo</span>
                <b>{d.goal.title}</b>
                <Progress value={(goalSkillsDone / d.goal.skills.length) * 100} tone="blue" label="Competências do objetivo" />
                <small>
                  {goalSkillsDone} de {d.goal.skills.length} competências registradas
                </small>
              </li>
            )}
          </ul>
        </section>

        <section className="panel-dark span-2 rise" style={{ '--i': 4 } as CSSProperties}>
          <header className="panel-head">
            <div>
              <h2>Onde você está em cada curso</h2>
              <p className="muted-on-dark">Aulas concluídas sobre o total.</p>
            </div>
          </header>
          <ul className="course-bars">
            {started.map((c) => {
              const st = d.courseStats[c.id]
              return (
                <li key={c.id}>
                  <Link href={'/cursos/' + c.id} className="cb-name">
                    {c.title}
                  </Link>
                  <div className="cb-track">
                    <span style={{ width: st.pct + '%' }} className={st.complete ? 'done' : ''} />
                  </div>
                  <span className="cb-val">
                    {st.done}/{st.total}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel-dark rise" style={{ '--i': 5 } as CSSProperties}>
          <header className="panel-head">
            <div>
              <h2>Suas competências já têm evidência?</h2>
              <p className="muted-on-dark">{totalSkills} competências, sem contar idiomas.</p>
            </div>
          </header>
          <div
            className="lvl-bar"
            role="img"
            aria-label={byLevel.map((l, i) => `${LEVEL_NAMES[i]}: ${l.length}`).join(', ')}
          >
            {byLevel.map(
              (l, i) =>
                l.length > 0 && (
                  <span key={i} className={'lvl-' + i} style={{ flexGrow: l.length }} title={`${LEVEL_NAMES[i]}: ${l.length}`} />
                ),
            )}
          </div>
          <ul className="lvl-legend">
            {[3, 2, 1, 0].map((i) => (
              <li key={i}>
                <i className={'sw lvl-' + i} />
                <span>{LEVEL_NAMES[i]}</span>
                <b>{byLevel[i].length}</b>
              </li>
            ))}
          </ul>
          <p className="muted-on-dark small">
            Demonstrada: tem projeto concluído ou certificado. Praticada: tem projeto em andamento ou experiência.
            Aprendida: só curso.
          </p>
          <Button variant="quiet-dark" size="sm" iconRight="ArrowRight" onClick={() => router.push('/competencias')}>
            Ver competências
          </Button>
        </section>

        <section className="panel-dark span-3 rise" style={{ '--i': 6 } as CSSProperties}>
          <header className="panel-head">
            <h2>Linha do tempo</h2>
            <Seg
              label="Filtrar linha do tempo"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'todos', label: 'Tudo' },
                { value: 'curso', label: 'Cursos' },
                { value: 'projeto', label: 'Projetos' },
                { value: 'certificado', label: 'Certificados' },
                { value: 'competencia', label: 'Competências' },
              ]}
            />
          </header>
          <ol className="timeline">
            {shown.map((e, i) => (
              <li key={e.title + e.date} className={e.strong ? 'strong' : ''} style={{ '--i': Math.min(i, 8) } as CSSProperties}>
                <time dateTime={e.date}>{formatDate(e.date)}</time>
                <span className="tl-dot">
                  <Icon name={e.icon} size={14} />
                </span>
                <Link href={e.to}>{e.title}</Link>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
