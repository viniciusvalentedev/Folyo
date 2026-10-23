'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Icon } from '@/components/ui/Icon'
import { fmtNum } from '../ui'

export type Column<T> = {
  key: string
  label: string
  num?: boolean
  /** false = sem ordenação (ex.: coluna de ações). */
  sortable?: boolean
  sortValue?: (row: T) => string | number
  render?: (row: T) => ReactNode
}

type Sort = { key: string; dir: 'asc' | 'desc' }
const collator = new Intl.Collator('pt-BR', { numeric: true })

/** Tabela do painel com ordenação por coluna e paginação (no navegador, para listas pequenas). */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  pageSize = 12,
  onRow,
  caption,
  empty,
  initialSort,
  resetKey,
}: {
  columns: Column<T>[]
  rows: T[]
  pageSize?: number
  onRow?: (row: T) => void
  caption: string
  empty: ReactNode
  initialSort?: Sort
  /** Quando muda (ex.: filtros), volta para a página 1. */
  resetKey?: string
}) {
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null)
  const [page, setPage] = useState(1)
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setPage(1)
  }

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const value = (r: T): string | number => (col.sortValue ? col.sortValue(r) : String((r as Record<string, unknown>)[col.key] ?? ''))
    const out = [...rows].sort((a, b) => {
      const x = value(a)
      const y = value(b)
      const diff = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
      return sort.dir === 'asc' ? diff : -diff
    })
    return out
  }, [rows, sort, columns])

  if (!rows.length) return <>{empty}</>

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages)
  const shown = sorted.slice((current - 1) * pageSize, current * pageSize)
  const from = (current - 1) * pageSize + 1
  const to = Math.min(sorted.length, current * pageSize)

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }))

  return (
    <>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const sortable = c.sortable !== false && !!c.label
                const active = sort?.key === c.key
                return (
                  <th
                    key={c.key}
                    className={c.num ? 'num' : ''}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {sortable ? (
                      <button type="button" onClick={() => toggle(c.key)}>
                        {c.label}
                        <Icon name={active ? (sort.dir === 'asc' ? 'ArrowUp' : 'ArrowDown') : 'ArrowUpDown'} size={13} />
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(row) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : ''}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="ad-pager" aria-label="Paginação">
          <span>
            {from}–{to} de {fmtNum(sorted.length)}
          </span>
          <button type="button" className={current > 1 ? '' : 'off'} disabled={current <= 1} aria-label="Página anterior" onClick={() => setPage(current - 1)}>
            <Icon name="ChevronLeft" size={18} />
          </button>
          <span>
            Página {current} de {pages}
          </span>
          <button type="button" className={current < pages ? '' : 'off'} disabled={current >= pages} aria-label="Próxima página" onClick={() => setPage(current + 1)}>
            <Icon name="ChevronRight" size={18} />
          </button>
        </nav>
      )}
    </>
  )
}
