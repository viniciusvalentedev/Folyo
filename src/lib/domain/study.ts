import { addDays, formatDayMonth, plural, weekdayOf } from '@/lib/format'
import type { DoneEntry } from '@/lib/types'

/** Um período do gráfico "Quanto você estudou": uma semana ou um dia. */
export type Bucket = { start: string; end: string; n: number; current: boolean }
export type StudyMode = 'semanas' | 'dias'

const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/** Segunda-feira da semana de uma data (AAAA-MM-DD). */
export function mondayOf(iso: string) {
  return addDays(iso, -((weekdayOf(iso) + 6) % 7))
}

/**
 * Aulas concluídas por semana (até 12 semanas) ou por dia (até 30 dias). O gráfico
 * começa no primeiro dia de estudo ou no dia do cadastro, o que for mais antigo.
 */
export function studyBuckets(log: DoneEntry[], joined: string, mode: StudyMode, today: string): Bucket[] {
  const first = [joined, log[0]?.date].filter(Boolean).sort()[0] || today
  const out: Bucket[] = []
  if (mode === 'semanas') {
    const thisWeek = mondayOf(today)
    let from = addDays(thisWeek, -84)
    if (mondayOf(first) > from) from = mondayOf(first)
    for (let d = from; d <= thisWeek; d = addDays(d, 7)) out.push({ start: d, end: addDays(d, 6), n: 0, current: d === thisWeek })
    for (const e of log) {
      const b = out.find((x) => e.date >= x.start && e.date <= x.end)
      if (b) b.n++
    }
  } else {
    let from = addDays(today, -29)
    if (first > from) from = first
    for (let d = from; d <= today; d = addDays(d, 1)) out.push({ start: d, end: d, n: 0, current: d === today })
    for (const e of log) {
      const b = out.find((x) => x.start === e.date)
      if (b) b.n++
    }
  }
  return out
}

/** As últimas `count` semanas (para as barrinhas dos cartões). */
export function lastWeeks(log: DoneEntry[], today: string, count = 8): { start: string; n: number }[] {
  const thisWeek = mondayOf(today)
  const weeks = Array.from({ length: count }, (_, i) => ({ start: addDays(thisWeek, -(count - 1 - i) * 7), n: 0 }))
  for (const e of log) {
    const w = weeks.find((x) => x.start === mondayOf(e.date))
    if (w) w.n++
  }
  return weeks
}

/** Rótulo curto (eixo) ou longo (dica) de um período. */
export function bucketLabel(b: Bucket, mode: StudyMode, long?: boolean) {
  if (mode === 'semanas') {
    if (b.current) return long ? 'Esta semana' : 'esta sem.'
    return long ? `Semana de ${formatDayMonth(b.start)}` : formatDayMonth(b.start)
  }
  if (b.current) return long ? `Hoje, ${formatDayMonth(b.start)}` : 'hoje'
  return long ? `${DAY_SHORT[weekdayOf(b.start)]}, ${formatDayMonth(b.start)}` : formatDayMonth(b.start)
}

export type StudyStat = { v: number; k: string; u: string; dec?: boolean }

/** Os três números acima do gráfico. */
export function studyStats(buckets: Bucket[], mode: StudyMode): StudyStat[] {
  const total = buckets.reduce((sum, b) => sum + b.n, 0)
  const best = buckets.reduce<Bucket | null>((top, b) => (b.n > (top ? top.n : 0) ? b : top), null)
  const totalStat = { v: total, k: 'Total no período', u: total === 1 ? 'aula' : 'aulas' }
  const bestUnit = best && best.n === 1 ? 'aula' : 'aulas'
  if (mode === 'semanas') {
    const complete = buckets.filter((b) => !b.current)
    const average = complete.length ? complete.reduce((sum, b) => sum + b.n, 0) / complete.length : null
    return [
      totalStat,
      average === null
        ? { v: buckets[buckets.length - 1].n, k: 'Esta semana', u: 'aulas' }
        : { v: average, k: 'Média por semana completa', u: 'aulas', dec: true },
      { v: best ? best.n : 0, k: best ? `Melhor semana · ${formatDayMonth(best.start)}` : 'Melhor semana', u: bestUnit },
    ]
  }
  return [
    totalStat,
    { v: buckets.filter((b) => b.n > 0).length, k: 'Dias com estudo', u: `de ${buckets.length}` },
    { v: best ? best.n : 0, k: best ? `Melhor dia · ${formatDayMonth(best.start)}` : 'Melhor dia', u: bestUnit },
  ]
}

/** Curva suave que passa por todos os pontos (sem "estourar" entre eles). */
export function smoothPath(points: [number, number][]) {
  const n = points.length
  if (n < 2) return ''
  const dx: number[] = []
  const slope: number[] = []
  const tangent = new Array<number>(n)
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1][0] - points[i][0]
    slope[i] = (points[i + 1][1] - points[i][1]) / dx[i]
  }
  tangent[0] = slope[0]
  tangent[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    tangent[i] =
      slope[i - 1] * slope[i] <= 0
        ? 0
        : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i])
  }
  let path = `M${points[0][0]},${points[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    path += ` C${points[i][0] + h},${points[i][1] + h * tangent[i]} ${points[i + 1][0] - h},${points[i + 1][1] - h * tangent[i + 1]} ${points[i + 1][0]},${points[i + 1][1]}`
  }
  return path
}

export const lessonsLabel = (n: number) => plural(n, 'aula', 'aulas')
