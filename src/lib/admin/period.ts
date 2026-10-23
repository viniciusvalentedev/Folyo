/**
 * Período dos relatórios e da audiência (dias no horário de Brasília).
 * Vale no servidor e no navegador. O banco aceita no máximo 366 dias por consulta.
 */

export const TZ = 'America/Sao_Paulo'
export const MAX_RANGE_DAYS = 366
export const PRESETS = [7, 30, 90] as const
export type Preset = (typeof PRESETS)[number] | 'custom'

const DAY_MS = 86_400_000
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** "2026-10-23" = hoje em Brasília. */
export const todayIso = (now = Date.now()) => dayFmt.format(now)

const toUtcMs = (day: string) => Date.parse(day + 'T12:00:00Z')
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)
export const shiftDay = (day: string, delta: number) => fromUtcMs(toUtcMs(day) + delta * DAY_MS)
export const isDay = (v: unknown): v is string => typeof v === 'string' && ISO_DAY.test(v) && !Number.isNaN(toUtcMs(v)) && fromUtcMs(toUtcMs(v)) === v

export type Period = { preset: Preset; from: string; to: string; days: string[] }

/** Lê ?dias=7|30|90 ou ?de=AAAA-MM-DD&ate=AAAA-MM-DD (valores estranhos viram 30 dias). */
export function resolvePeriod(input: { dias?: string; de?: string; ate?: string }, now = Date.now()): Period {
  const today = todayIso(now)
  let from: string
  let to = today
  let preset: Preset = 30
  if (isDay(input.de) && isDay(input.ate)) {
    from = input.de <= input.ate ? input.de : input.ate
    to = input.de <= input.ate ? input.ate : input.de
    if (to > today) to = today
    if (from > to) from = to
    if ((toUtcMs(to) - toUtcMs(from)) / DAY_MS + 1 > MAX_RANGE_DAYS) from = shiftDay(to, -(MAX_RANGE_DAYS - 1))
    preset = 'custom'
  } else {
    const n = Number(input.dias)
    preset = (PRESETS as readonly number[]).includes(n) ? (n as (typeof PRESETS)[number]) : 30
    from = shiftDay(today, -(preset - 1))
  }
  const days: string[] = []
  for (let d = from; d <= to; d = shiftDay(d, 1)) days.push(d)
  return { preset, from, to, days }
}

/** "2026-10-22" → "22/10/2026". */
export const fmtDayFull = (day: string) => day.split('-').reverse().join('/')
