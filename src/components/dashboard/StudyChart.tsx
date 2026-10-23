'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { bucketLabel, smoothPath, studyBuckets, studyStats, type StudyMode } from '@/lib/domain/study'
import { formatDate, plural } from '@/lib/format'
import { useToday } from '@/lib/use-today'
import { useWidth } from '@/lib/use-width'

const MODES: [StudyMode, string][] = [
  ['semanas', 'Semanas'],
  ['dias', 'Dias'],
]

/** "Quanto você estudou": aulas concluídas por semana ou por dia. */
export function StudyChart() {
  const { s, d } = useApp()
  const router = useRouter()
  const today = useToday()
  const weeks = useMemo(
    () => (today ? studyBuckets(d.doneLog, s.user.joined, 'semanas', today) : []),
    [d.doneLog, s.user.joined, today],
  )
  const [picked, setPicked] = useState<StudyMode | null>(null)
  const mode: StudyMode = picked || (weeks.length >= 3 ? 'semanas' : 'dias')
  const data = useMemo(
    () => (!today ? [] : mode === 'semanas' ? weeks : studyBuckets(d.doneLog, s.user.joined, 'dias', today)),
    [mode, weeks, d.doneLog, s.user.joined, today],
  )
  const [plot, setPlot] = useState<HTMLDivElement | null>(null)
  const width = useWidth(plot)
  const [hover, setHover] = useState<number | null>(null)
  const [focus, setFocus] = useState<number | null>(null)

  const head = (
    <header className="stc-head">
      <h2>Quanto você estudou:</h2>
      <div className="stc-mode" role="group" aria-label="Agrupar por">
        {MODES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={mode === value ? 'on' : ''}
            onClick={() => {
              setPicked(value)
              setHover(null)
              setFocus(null)
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </header>
  )

  if (!today) {
    return (
      <section className="stc is-loading" aria-busy="true" aria-label="Carregando o histórico de estudo">
        {head}
        <div className="stc-stats">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <span className="skel-l" style={{ width: 64, height: 26 }} />
              <span className="skel-l" style={{ width: 96, height: 10 }} />
            </div>
          ))}
        </div>
        <div className="stc-plot">
          <span className="skel-l" style={{ width: '100%', height: 180 }} />
        </div>
      </section>
    )
  }

  if (!d.doneLog.length) {
    return (
      <section className="stc is-empty" aria-label="Quanto você estudou">
        {head}
        <div className="stc-empty">
          <svg viewBox="0 0 400 90" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 70 C 60 70, 80 40, 140 46 S 230 70, 280 50 S 360 24, 400 30" className="stc-ghost" />
          </svg>
          <div>
            <b>Seu gráfico começa na primeira aula concluída.</b>
            <p>Cada aula marcada como concluída entra aqui, no dia em que você concluiu.</p>
            <button type="button" className="stc-cta" onClick={() => router.push('/cursos')}>
              <Icon name="Compass" size={16} />
              Explorar cursos
            </button>
          </div>
        </div>
      </section>
    )
  }

  const count = data.length
  const active = hover ?? focus ?? count - 1
  const stats = studyStats(data, mode)
  const total = stats[0].v
  const height = width < 560 ? 190 : 230
  const padLeft = 26
  const padRight = 14
  const padTop = 34
  const padBottom = 30
  const peak = Math.max(...data.map((b) => b.n), 0)
  const top = Math.max(2, peak % 2 ? peak + 1 : peak)
  const ticks = top <= 4 ? [0, top / 2, top] : [0, Math.round(top / 2), top]
  const span = Math.max(1, width - padLeft - padRight)
  const xOf = (i: number) => (count === 1 ? padLeft + span / 2 : padLeft + (i / (count - 1)) * span)
  const yOf = (n: number) => padTop + (height - padTop - padBottom) * (1 - n / top)
  const points = data.map((b, i): [number, number] => [xOf(i), yOf(b.n)])
  const path = smoothPath(points)
  const activeX = xOf(active)
  const activeY = yOf(data[active].n)
  const labelEvery = Math.max(2, Math.floor(span / 74))
  const labelStep = Math.ceil(count / labelEvery)
  const pointAt = (clientX: number, box: DOMRect) => {
    const x = clientX - box.left - padLeft
    setHover(Math.max(0, Math.min(count - 1, Math.round((x / span) * (count - 1)))))
  }
  const tipLeft = Math.max(6, Math.min(width - 156, activeX - 75))
  const summary = `${plural(total, 'aula concluída', 'aulas concluídas')} em ${mode === 'semanas' ? plural(count, 'semana', 'semanas') : plural(count, 'dia', 'dias')}.`

  return (
    <section className="stc" aria-label="Quanto você estudou">
      {head}
      <div className="stc-stats">
        {stats.map((stat) => (
          <div key={stat.k}>
            <b>
              {stat.dec ? String(Math.round(stat.v * 10) / 10).replace('.', ',') : stat.v}
              <small> {stat.u}</small>
            </b>
            <span>{stat.k}</span>
          </div>
        ))}
      </div>
      <div className="stc-plot" ref={setPlot}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            className="stc-svg"
            role="img"
            tabIndex={0}
            aria-label={`Aulas concluídas por ${mode === 'semanas' ? 'semana' : 'dia'}: ${summary} Use as setas para percorrer.`}
            onMouseMove={(e) => pointAt(e.clientX, e.currentTarget.getBoundingClientRect())}
            onMouseLeave={() => setHover(null)}
            onTouchStart={(e) => pointAt(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchMove={(e) => pointAt(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault()
                setFocus(Math.max(0, active - 1))
              } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                setFocus(Math.min(count - 1, active + 1))
              } else if (e.key === 'Home') setFocus(0)
              else if (e.key === 'End') setFocus(count - 1)
            }}
            onBlur={() => setFocus(null)}
          >
            <defs>
              <clipPath id="stc-past">
                <rect x="0" y="0" width={activeX + 0.5} height={height} />
              </clipPath>
              <linearGradient id="stc-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2D24C8" stopOpacity=".16" />
                <stop offset="1" stopColor="#2D24C8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={padLeft} x2={width - padRight} y1={yOf(t)} y2={yOf(t)} className="stc-grid" />
                <text x={padLeft - 8} y={yOf(t) + 4} textAnchor="end" className="stc-ax">
                  {t}
                </text>
              </g>
            ))}
            {count > 1 ? (
              <g key={mode}>
                <path
                  d={`${path} L${xOf(count - 1)},${yOf(0)} L${xOf(0)},${yOf(0)} Z`}
                  fill="url(#stc-area)"
                  clipPath="url(#stc-past)"
                  className="stc-area"
                />
                <path d={path} className="stc-line faded" />
                <path d={path} className="stc-line" clipPath="url(#stc-past)" pathLength="1" />
              </g>
            ) : (
              <circle cx={xOf(0)} cy={yOf(data[0].n)} r="3" className="stc-only" />
            )}
            <line x1={activeX} x2={activeX} y1={activeY + 8} y2={height - padBottom} className="stc-drop" />
            <circle cx={activeX} cy={activeY} r="11" className="stc-halo" />
            <circle cx={activeX} cy={activeY} r="5.5" className="stc-dot" />
            {data.map((b, i) => {
              const on = i === active
              const crowded = Math.abs(xOf(i) - activeX) < (active === count - 1 || active === 0 ? 78 : 60) && !on
              if (!on && (crowded || i % labelStep !== (count - 1) % labelStep)) return null
              return (
                <text
                  key={b.start}
                  x={xOf(i)}
                  y={height - 9}
                  textAnchor={i === 0 && !on ? 'start' : i === count - 1 ? 'end' : 'middle'}
                  className={'stc-x' + (on ? ' on' : '')}
                >
                  {bucketLabel(b, mode)}
                </text>
              )
            })}
          </svg>
        )}
        {width > 0 && (
          <div className="stc-tip" style={{ left: tipLeft, top: Math.max(0, activeY - 58) }} role="status" aria-live="polite">
            <b>{plural(data[active].n, 'aula', 'aulas')}</b>
            <span>{bucketLabel(data[active], mode, true)}</span>
          </div>
        )}
      </div>
      {count < 2 && (
        <p className="stc-note">
          Seu histórico começa {mode === 'dias' ? 'hoje' : 'nesta semana'}. A linha ganha forma conforme você estuda.
        </p>
      )}
      <details className="stc-table">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr>
              <th>{mode === 'semanas' ? 'Semana' : 'Dia'}</th>
              <th>Aulas concluídas</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr key={b.start}>
                <td>{mode === 'semanas' ? `${formatDate(b.start)} a ${formatDate(b.end)}` : formatDate(b.start)}</td>
                <td>{b.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
