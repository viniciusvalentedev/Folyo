import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'

/**
 * Carrinho, cupom de lançamento e pré-acesso: tipos, textos e formatação (navegador e servidor).
 *
 * ATENÇÃO: nada aqui decide preço, desconto ou acesso. Quem decide é o banco (quote_cart,
 * redeem_launch_coupon e has_course_access, em supabase/migrations/20261029000001_cupom_lancamento.sql).
 * O navegador só manda ids de cursos e o código digitado. PROMO serve só para os textos da tela.
 */

export const PROMO = { code: 'FOLYO100', days: 30 } as const

/** Máximo de cursos no carrinho (o banco recusa mais que isso). */
export const CART_MAX = 50
export const COUPON_MAX = 40

export const COUPON_MESSAGES = {
  empty: 'Digite o código do cupom.',
  invalid: 'Este cupom não existe ou não é válido.',
  ended: 'A promoção de lançamento foi encerrada.',
} as const

export const REDEEM_FAILED = 'Não foi possível liberar o pré-acesso agora. Confira sua conexão e tente de novo.'

/** Por que um curso saiu do carrinho sozinho. */
export type DropReason = 'fora_de_venda' | 'gratuito' | 'ja_possui'

export type CartLine = {
  courseId: string
  title: string
  priceCents: number
  /** O cupom aplicado vale para este curso. */
  eligible: boolean
  discountCents: number
  finalCents: number
}

export type CartQuote = {
  items: CartLine[]
  dropped: { courseId: string; reason: DropReason }[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  /** Código aplicado (normalizado) ou null. */
  coupon: string | null
  couponError: string | null
  percentOff: number
  accessDays: number | null
}

export type PreAccess = { id: string; title: string; expiresAt: string }

export type CouponResult = { ok: true; courses: PreAccess[]; leftoverIds: string[]; droppedIds: string[] } | { ok: false; error: string }

const cents = z.number().int().min(0).max(1_000_000_000)
const courseId = z.string().regex(ID_PATTERN)

export const quoteSchema = z.object({
  items: z.array(
    z.object({
      courseId,
      title: z.string().max(200),
      priceCents: cents,
      eligible: z.boolean(),
      discountCents: cents,
      finalCents: cents,
    }),
  ),
  dropped: z.array(z.object({ courseId, reason: z.enum(['fora_de_venda', 'gratuito', 'ja_possui']) })),
  subtotalCents: cents,
  discountCents: cents,
  totalCents: cents,
  coupon: z.string().max(COUPON_MAX).nullable(),
  couponError: z.string().max(200).nullable(),
  percentOff: z.number().int().min(0).max(100),
  accessDays: z.number().int().min(1).max(365).nullable(),
}) satisfies z.ZodType<CartQuote>

export const redeemSchema = z.object({
  courses: z.array(z.object({ id: courseId, title: z.string().max(200), expiresAt: z.string().max(64) })),
  leftoverIds: z.array(courseId),
  droppedIds: z.array(courseId),
})

/** Mensagens de cupom que o banco escreve e que podem ir para a tela (as outras viram uma genérica). */
export const SAFE_COUPON_ERRORS: readonly string[] = [
  ...Object.values(COUPON_MESSAGES),
  'Nenhum curso do carrinho participa da promoção de lançamento.',
]

/** Só para a tela (o banco normaliza de novo): sem espaços nas pontas, em maiúsculas. */
export const normalizeCoupon = (code: string) => code.trim().toUpperCase()

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** Centavos → "R$ 32,99" (com o espaço não separável que o Intl usa depois do "R$"). */
export const formatBRL = (value: number) => BRL.format(value / 100)

/**
 * Campo de preço do painel: "32,99", "R$ 1.299,90", "49.9" → centavos. Vazio = null (gratuito).
 * Texto que não é preço = 'invalid' (o curso NÃO vira gratuito por um erro de digitação).
 */
export function parsePriceInput(text: string): number | null | 'invalid' {
  const t = text.replace(/R\$/i, '').replace(/\s/g, '')
  if (!t) return null
  // Com vírgula: ponto é separador de milhar. Sem vírgula: ponto é decimal ("49.9").
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return 'invalid'
  const value = Math.round(Number(normalized) * 100)
  return value === 0 ? null : value
}

/** Centavos → "32,99" (para o campo do painel). */
export const priceInputValue = (value: number | null) => (value ? (value / 100).toFixed(2).replace('.', ',') : '')

const DAY = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
/** Instante → "28/11/2026" (horário de Brasília). */
export function formatDateBR(timestamp: string) {
  const d = new Date(timestamp)
  return Number.isNaN(d.getTime()) ? '' : DAY.format(d)
}

/** "Um curso saiu do carrinho…" / "3 cursos saíram do carrinho…". */
export function droppedNotice(n: number) {
  return n === 1
    ? 'Um curso saiu do carrinho porque já está na sua conta ou não está mais à venda.'
    : `${n} cursos saíram do carrinho porque já estão na sua conta ou não estão mais à venda.`
}

// ---------- Carrinho no navegador (só ids e o código; nunca preço) ----------

export type CartState = { ids: string[]; coupon: string | null }
export const EMPTY_CART: CartState = Object.freeze({ ids: [], coupon: null }) as CartState

const COUPON_PATTERN = /^[A-Z0-9]{3,40}$/

/** Operações do carrinho. Devolvem o MESMO objeto quando nada muda (sem duplicar curso). */
export const cartOps = {
  add(s: CartState, id: string): CartState {
    if (!ID_PATTERN.test(id) || s.ids.includes(id) || s.ids.length >= CART_MAX) return s
    return { ...s, ids: [...s.ids, id] }
  },
  remove(s: CartState, id: string): CartState {
    return s.ids.includes(id) ? { ...s, ids: s.ids.filter((x) => x !== id) } : s
  },
  toggle(s: CartState, id: string): CartState {
    return s.ids.includes(id) ? cartOps.remove(s, id) : cartOps.add(s, id)
  },
  removeMany(s: CartState, ids: readonly string[]): CartState {
    const out = s.ids.filter((x) => !ids.includes(x))
    return out.length === s.ids.length ? s : { ...s, ids: out }
  },
  clear(s: CartState): CartState {
    return s.ids.length || s.coupon ? EMPTY_CART : s
  },
  setCoupon(s: CartState, code: string): CartState {
    const c = normalizeCoupon(code)
    if (!COUPON_PATTERN.test(c)) return s.coupon ? { ...s, coupon: null } : s
    return s.coupon === c ? s : { ...s, coupon: c }
  },
  clearCoupon(s: CartState): CartState {
    return s.coupon ? { ...s, coupon: null } : s
  },
}

/** Lê o que estava guardado no navegador, descartando qualquer coisa fora do formato. */
export function parseStoredCart(idsRaw: string | null, couponRaw: string | null): CartState {
  let ids: string[] = []
  try {
    const parsed: unknown = idsRaw ? JSON.parse(idsRaw) : []
    if (Array.isArray(parsed)) ids = [...new Set(parsed.filter((x): x is string => typeof x === 'string' && ID_PATTERN.test(x)))].slice(0, CART_MAX)
  } catch {
    ids = []
  }
  const coupon = couponRaw && COUPON_PATTERN.test(couponRaw) ? couponRaw : null
  return ids.length || coupon ? { ids, coupon } : EMPTY_CART
}

// ---------- Situação do aluno em relação a um curso (só para a tela) ----------

export type AccessRow = { courseId: string; source: 'compra' | 'manual' | 'cupom'; grantedAt: string; expiresAt: string | null; active: boolean }

export type Shop = {
  /** Id da conta (para as chaves do navegador: carrinho e aviso de lançamento). */
  userId: string
  /** Equipe com o 2º fator: o banco libera todos os cursos. */
  staff: boolean
  access: AccessRow[]
  /** Promoção de lançamento ligada no banco agora. */
  promoActive: boolean
}

export type CourseOffer =
  | { kind: 'gratuito' }
  | { kind: 'pre-acesso'; until: string }
  | { kind: 'comprado' }
  | { kind: 'equipe' }
  | { kind: 'a-venda'; priceCents: number }

/** Gratuito, já liberado (e como) ou à venda. */
export function offerOf(course: { id: string; priceCents?: number | null }, shop: Pick<Shop, 'staff' | 'access'>): CourseOffer {
  const price = course.priceCents ?? 0
  if (price <= 0) return { kind: 'gratuito' }
  const rows = shop.access.filter((a) => a.courseId === course.id && a.active)
  if (rows.some((a) => a.source !== 'cupom')) return { kind: 'comprado' }
  const promo = rows.find((a) => a.source === 'cupom')
  if (promo?.expiresAt) return { kind: 'pre-acesso', until: promo.expiresAt }
  if (shop.staff) return { kind: 'equipe' }
  return { kind: 'a-venda', priceCents: price }
}

export const canWatch = (offer: CourseOffer) => offer.kind !== 'a-venda'
