'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { fmtDayFull, PRESETS, todayIso, type Period } from '@/lib/admin/period'

/**
 * Filtro de período (7, 30 e 90 dias ou datas livres). O período fica no ENDEREÇO da página
 * (?dias=30 ou ?de=...&ate=...), então o servidor já devolve os números do período certo
 * e o link pode ser compartilhado.
 */
export function PeriodBar({
  base,
  period,
  extra = {},
  children,
}: {
  base: string
  period: Period
  /** Outros parâmetros do endereço que devem ser mantidos (ex.: a aba aberta). */
  extra?: Record<string, string>
  children?: ReactNode
}) {
  const router = useRouter()
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const [custom, setCustom] = useState(period.preset === 'custom')

  const href = (params: Record<string, string>) => {
    const q = new URLSearchParams({ ...extra, ...params })
    return q.size ? `${base}?${q}` : base
  }
  const apply = () => {
    if (!from || !to) return
    router.push(href({ de: from, ate: to }))
  }

  return (
    <div className="ad-filters" role="group" aria-label="Período">
      <div className="seg seg-sm">
        {PRESETS.map((p) => (
          <Link key={p} href={href({ dias: String(p) })} className={period.preset === p ? 'on' : ''} aria-current={period.preset === p ? 'true' : undefined} onClick={() => setCustom(false)}>
            {p} dias
          </Link>
        ))}
        <button type="button" className={custom || period.preset === 'custom' ? 'on' : ''} aria-pressed={custom || period.preset === 'custom'} onClick={() => setCustom(true)}>
          Personalizado
        </button>
      </div>
      {(custom || period.preset === 'custom') && (
        <span className="ad-range">
          <label className="sr-only" htmlFor="pf-from">
            De
          </label>
          <input id="pf-from" type="date" className="inp inp-sm" value={from} max={to || todayIso()} onChange={(e) => setFrom(e.target.value)} />
          <span>até</span>
          <label className="sr-only" htmlFor="pf-to">
            Até
          </label>
          <input id="pf-to" type="date" className="inp inp-sm" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} />
          <button type="button" className="btn btn-quiet btn-sm" onClick={apply}>
            <span>Aplicar</span>
          </button>
        </span>
      )}
      <span className="ad-range-note">
        {fmtDayFull(period.from)} a {fmtDayFull(period.to)} · {period.days.length} {period.days.length === 1 ? 'dia' : 'dias'}
      </span>
      {children}
    </div>
  )
}
