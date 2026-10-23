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
 * Use só em eventos (cliques); durante a renderização, use useNow().
 */
export function todayISO(now: Date = new Date()) {
  return localISODate(now)
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

/** Soma (ou subtrai) dias de uma data AAAA-MM-DD, sem se perder com fuso horário. */
export function addDays(iso: string, days: number) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return localISODate(new Date(y, m - 1, d + days))
}

/** Dia da semana de uma data AAAA-MM-DD (0 = domingo). */
export function weekdayOf(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

/**
 * Id curto para itens DENTRO de listas (passos, links, formação...) e avisos da tela.
 * Formato: letras minúsculas, números e hífen (o servidor confere).
 */
export function newId(prefix = 'id') {
  return prefix + '-' + crypto.randomUUID().slice(0, 8)
}

/**
 * Id de projetos e competências (uuid). É criado no navegador para a tela poder
 * abrir o projeto na hora; o banco só aceita se for um uuid válido e, se o id já
 * existir (de outra pessoa), recusa — ninguém sobrescreve dados de outro aluno.
 */
export function newUuid() {
  return crypto.randomUUID()
}

/** O público da Folyo é do Brasil: um instante vira AAAA-MM-DD no horário de Brasília. */
const BR_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export function brDate(timestamp: string) {
  const d = new Date(timestamp)
  return Number.isNaN(d.getTime()) ? '' : BR_DATE.format(d)
}
