/**
 * Dados do cadastro completo: celular (src/lib/phone.ts), data de nascimento e gênero.
 * Arquivo sem dependências de servidor: roda na tela e nas ações.
 *
 * Ficam numa tabela fora da API (private.personal_data) e só são lidos e gravados pelas funções
 * my_personal_data / save_my_personal_data, sempre da PRÓPRIA conta
 * (supabase/migrations/20261104000002_dados_do_cadastro.sql). Nunca aparecem no perfil público nem no painel.
 */

/** Tela "Concluir cadastro" e o aviso do sino que leva até ela (fica até a pessoa concluir; não some ao ler). */
export const COMPLETE_PROFILE_PATH = '/concluir-cadastro'
export const COMPLETE_PROFILE_NOTICE_ID = 'n-concluir-cadastro'

/** Opções de gênero. Os ids são os mesmos que o banco aceita (CHECK de private.personal_data). */
export const GENDERS = [
  { id: 'feminino', label: 'Feminino' },
  { id: 'masculino', label: 'Masculino' },
  { id: 'nao_informar', label: 'Prefiro não informar' },
] as const

export type Gender = (typeof GENDERS)[number]['id']
export const GENDER_IDS = GENDERS.map((g) => g.id) as [Gender, ...Gender[]]

export const genderLabel = (id: string) => GENDERS.find((g) => g.id === id)?.label ?? ''

/** Idade mínima e máxima aceitas (o banco confere as mesmas). Menores de 18 usam com autorização (Termos). */
export const MIN_AGE = 10
export const MAX_AGE = 120

/** Data de hoje no fuso do Brasil (AAAA-MM-DD), para a idade não mudar de dia antes da hora. */
export function todayBR(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

/** "31/12/2000" → "2000-12-31", ou null se não for uma data que existe. */
export function parseBirthDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim())
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date "conserta" 31/02 para 03/03: se mudou, a data não existe.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${yyyy}-${mm}-${dd}`
}

/** Idade completa em anos numa data (as duas no formato AAAA-MM-DD). */
export function ageOn(birthISO: string, todayISO: string) {
  const [by, bm, bd] = birthISO.split('-').map(Number)
  const [ty, tm, td] = todayISO.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

/** A data existe e dá uma idade entre MIN_AGE e MAX_AGE hoje. */
export function birthDateInRange(birthISO: string, todayISO = todayBR()) {
  const age = ageOn(birthISO, todayISO)
  return age >= MIN_AGE && age <= MAX_AGE
}

/** Máscara enquanto digita: "3112200" → "31/12/200". Só números, no máximo 8. */
export function maskBirthDate(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/** "2000-12-31" → "31/12/2000". Vazio continua vazio. */
export function formatBirthDate(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}
