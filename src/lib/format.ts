import { DEMO_REFERENCE_DATE } from '@/lib/mock/catalog'

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

/** "12 out 2026" ou, por extenso, "12 de outubro de 2026". */
export function formatDate(iso: string | null | undefined, long?: boolean) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return long ? `${d} de ${MONTHS[m - 1]} de ${y}` : `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

/** "12 out". */
export function formatDayMonth(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS_SHORT[m - 1]}`
}

/** "terça, 20 de outubro" */
export function formatWeekdayLong(date: Date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`
}

/** 75 -> "1 h 15 min"; 40 -> "40 min". */
export function formatMinutes(min: number) {
  if (min >= 60) return `${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + ' min' : ''}`.trim()
  return `${min} min`
}

/** plural(1, 'aula', 'aulas') -> "1 aula" */
export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

export function monthName(i: number) {
  return MONTHS[i]
}

export function monthShort(i: number) {
  return MONTHS_SHORT[i]
}

/**
 * Data de hoje (AAAA-MM-DD) para registrar ações (ex.: aula concluída).
 * Nos dados de demonstração nunca é antes da data de referência.
 * Use só em eventos (cliques), não durante a renderização.
 */
export function todayISO(now: Date = new Date()) {
  const t = localISODate(now)
  return t < DEMO_REFERENCE_DATE ? DEMO_REFERENCE_DATE : t
}

/** AAAA-MM-DD no fuso horário do aluno (toISOString usaria o horário de Londres). */
export function localISODate(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Segunda-feira da semana de uma data (AAAA-MM-DD). */
export function weekStart(iso: string) {
  const d = new Date(iso + 'T12:00:00')
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return d.toISOString().slice(0, 10)
}

/**
 * Gera um id para itens criados no navegador (só na demonstração).
 * Com o banco, quem cria o id passa a ser o Supabase (uuid).
 */
export function newId(prefix = 'id') {
  return prefix + '-' + crypto.randomUUID().slice(0, 8)
}
