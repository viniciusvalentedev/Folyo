'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { fmtDay, fmtNum } from './ui'

/** Gráfico de linha por dia (igual ao do protótipo), com opção "Ver tabela" para leitores de tela. */
export function LineChart({
  title,
  data,
  empty = 'Ainda não há registros neste período.',
  height = 200,
}: {
  title: string
  data: { d: string; v: number }[]
  empty?: string
  height?: number
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [table])

  const hasData = data.some((p) => p.v > 0)
  const pad = { l: 40, r: 12, t: 12, b: 26 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const top = Math.max(1, ...data.map((p) => p.v))
  const scale = top <= 5 ? Math.ceil(top) : Math.ceil(top / 10 ** Math.floor(Math.log10(top))) * 10 ** Math.floor(Math.log10(top))
  const x = (i: number) => pad.l + (data.length <= 1 ? w / 2 : (i / (data.length - 1)) * w)
  const y = (v: number) => pad.t + h - (v / scale) * h
  const path = data.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('')
  const step = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(w / 70))))

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - pad.l) / w) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((i) => Math.min(data.length - 1, (i ?? -1) + 1))
    if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? data.length) - 1))
  }

  return (
    <figure className="ad-chart">
      <figcaption>
        <b>{title}</b>
        {hasData && (
          <button type="button" className="ad-link" onClick={() => setTable(!table)}>
            {table ? 'Ver gráfico' : 'Ver tabela'}
          </button>
        )}
      </figcaption>
      {!hasData ? (
        <p className="ad-chart-empty">
          <Icon name="ChartColumn" size={18} />
          {empty}
        </p>
      ) : table ? (
        <div className="ad-table-wrap small">
          <table className="ad-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">{title}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.d}>
                  <td>{fmtDay(p.d)}</td>
                  <td className="num">{fmtNum(p.v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="ad-chart-box">
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title}: gráfico de linha por dia`}
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {[0, scale / 2, scale].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="ad-grid" />
                <text x={pad.l - 8} y={y(v) + 4} className="ad-axis" textAnchor="end">
                  {fmtNum(v)}
                </text>
              </g>
            ))}
            {data.map(
              (p, i) =>
                ((i % step === 0 && (data.length - 1 - i >= step * 0.75 || i === 0)) || i === data.length - 1) && (
                  <text
                    key={p.d}
                    x={x(i)}
                    y={height - 6}
                    className="ad-axis"
                    textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                  >
                    {fmtDay(p.d)}
                  </text>
                ),
            )}
            <path d={path} className="ad-line" />
            {hover !== null && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} className="ad-cross" />
                <circle cx={x(hover)} cy={y(data[hover].v)} r={5} className="ad-dot" />
              </>
            )}
          </svg>
          {hover !== null && (
            <div className="ad-tip" style={{ left: Math.min(width - 150, Math.max(0, x(hover) - 70)) }}>
              <b>{fmtNum(data[hover].v)}</b>
              <span>{fmtDay(data[hover].d)}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
