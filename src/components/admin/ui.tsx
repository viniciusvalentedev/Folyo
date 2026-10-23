import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon, type IconName } from '@/components/ui/Icon'

/** Peças visuais do painel (iguais às do protótipo). Funcionam no servidor e no navegador. */

const TZ = 'America/Sao_Paulo'
const NUM = new Intl.NumberFormat('pt-BR')
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
const DATE_TIME = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const DAY = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit' })

const valid = (v: string | null | undefined) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export const fmtNum = (n: number) => NUM.format(n)
export const fmtPct = (n: number | null) => (n === null ? '—' : NUM.format(Math.round(n * 10) / 10) + '%')
export const fmtDate = (v: string | null | undefined) => (valid(v) ? DATE.format(valid(v)!) : '—')
export const fmtDateTime = (v: string | null | undefined) => (valid(v) ? DATE_TIME.format(valid(v)!) : '—')
/** "2026-10-22" (dia do banco, já no horário de Brasília) → "22/10". */
export const fmtDay = (day: string) => (valid(day + 'T12:00:00Z') ? DAY.format(new Date(day + 'T12:00:00Z')) : day)

/** 3725 → "1 h 02 min"; 540 → "9 min"; 45 → "45 s". */
export function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/** 125 → "2:05"; 3725 → "1:02:05" (posição dentro do vídeo). */
export function fmtClock(sec: number) {
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`
}

/** "há 3 dias", "hoje", "nunca". */
export function fmtAgo(v: string | null | undefined, now: number) {
  const d = valid(v)
  if (!d) return 'Nunca'
  const min = Math.round((now - d.getTime()) / 60000)
  if (min < 2) return 'Agora há pouco'
  if (min < 60) return `Há ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Há ${h} h`
  const days = Math.round(h / 24)
  if (days === 1) return 'Ontem'
  if (days < 30) return `Há ${days} dias`
  return fmtDate(v)
}

/** Variação em % contra o período anterior (null = sem base). */
export function delta(cur: number, prev: number) {
  if (!prev) return cur ? null : 0
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

export function AdminHead({
  title,
  lead,
  actions,
  children,
}: {
  title: string
  lead?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="ad-head">
      <div className="ad-head-text">
        <h1>{title}</h1>
        {lead && <p className="ad-lead">{lead}</p>}
        {children}
      </div>
      {actions && <div className="ad-head-actions">{actions}</div>}
    </header>
  )
}

export function Metric({
  label,
  value,
  prev,
  change,
  hint,
  icon,
  href,
  empty,
}: {
  label: string
  value: ReactNode
  prev?: ReactNode
  change?: number | null
  hint?: ReactNode
  icon?: IconName
  href?: string
  empty?: boolean
}) {
  const up = change != null && change > 0
  const down = change != null && change < 0
  const body = (
    <>
      <span className="ad-metric-k">
        {icon && <Icon name={icon} size={15} />}
        {label}
      </span>
      <b className={empty ? 'is-empty' : ''}>{empty ? 'Sem dados' : value}</b>
      {(change !== undefined || hint || prev !== undefined) && (
        <span className="ad-metric-f">
          {change !== undefined &&
            (change === null ? (
              <em className="flat">sem base de comparação</em>
            ) : (
              <em className={up ? 'up' : down ? 'down' : 'flat'}>
                <Icon name={up ? 'TrendingUp' : down ? 'TrendingDown' : 'Minus'} size={13} />
                {change > 0 ? '+' : ''}
                {fmtNum(change)}%
              </em>
            ))}
          {prev !== undefined && <span>antes: {prev}</span>}
          {hint && <span>{hint}</span>}
        </span>
      )}
    </>
  )
  return href ? (
    <Link href={href} className="ad-metric click">
      {body}
    </Link>
  ) : (
    <div className="ad-metric">{body}</div>
  )
}

export function Notice({
  tone = 'info',
  icon,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'err' | 'ok'
  icon?: IconName
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={'ad-notice ad-notice-' + tone} role={tone === 'err' ? 'alert' : undefined}>
      <Icon name={icon || (tone === 'info' ? 'Info' : tone === 'ok' ? 'CircleCheck' : 'CircleAlert')} size={17} />
      <div>{children}</div>
      {action}
    </div>
  )
}

/** Barras horizontais (ranking). */
export function Bars({
  title,
  items,
  empty = 'Ainda não há registros.',
  max = 8,
}: {
  title: string
  items: { key: string; label: string; value: number; href?: string }[]
  empty?: string
  max?: number
}) {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value).slice(0, max)
  const top = Math.max(1, ...list.map((i) => i.value))
  return (
    <figure className="ad-chart">
      <figcaption>
        <b>{title}</b>
      </figcaption>
      {list.length ? (
        <ol className="ad-bars">
          {list.map((i) => {
            const row = (
              <>
                <span className="ad-bar-label">{i.label}</span>
                <span className="ad-bar-track">
                  <span className="ad-bar" style={{ width: `${(i.value / top) * 100}%` }} />
                </span>
                <span className="ad-bar-val">{fmtNum(i.value)}</span>
              </>
            )
            return (
              <li key={i.key}>
                {i.href ? (
                  <Link href={i.href} className="ad-bar-row" title={`${i.label}: ${fmtNum(i.value)}`}>
                    {row}
                  </Link>
                ) : (
                  <div className="ad-bar-row" title={`${i.label}: ${fmtNum(i.value)}`}>
                    {row}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="ad-chart-empty">
          <Icon name="ChartColumn" size={18} />
          {empty}
        </p>
      )}
    </figure>
  )
}

export function Badge({ tone, children }: { tone: 'ok' | 'err' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={'ad-badge ad-badge-' + tone}>{children}</span>
}

/** Paginação por endereço (?pagina=N). */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="ad-pager" aria-label="Paginação">
      <span>
        {from}–{to} de {fmtNum(total)}
      </span>
      {page > 1 ? (
        <Link href={href(page - 1)} aria-label="Página anterior">
          <Icon name="ChevronLeft" size={18} />
        </Link>
      ) : (
        <span className="off" aria-hidden="true">
          <Icon name="ChevronLeft" size={18} />
        </span>
      )}
      <span>
        Página {page} de {pages}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} aria-label="Próxima página">
          <Icon name="ChevronRight" size={18} />
        </Link>
      ) : (
        <span className="off" aria-hidden="true">
          <Icon name="ChevronRight" size={18} />
        </span>
      )}
    </nav>
  )
}
