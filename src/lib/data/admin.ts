import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { can, ROLE_KEYS, type Perm, type Role } from '@/lib/admin/roles'
import { getAal } from '@/lib/data/mfa'
import { getAccount, getSessionUser } from '@/lib/data/user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Dados do PAINEL ADMIN (só servidor).
 *
 * Tudo passa por funções do banco (admin_*) que conferem o papel de quem chamou
 * antes de responder. A checagem daqui (`staffContext`) só serve para mostrar a
 * tela certa ("sem acesso") sem nem perguntar ao banco. Quem decide é o banco.
 *
 * As respostas são conferidas com zod antes de ir para a tela, como no resto do site.
 */

export type StaffContext = { id: string; email: string; role: Role }

/** Quem está logado e qual o papel, sem olhar o 2º fator (null se não estiver logado ou estiver suspenso). */
const baseContext = cache(async (): Promise<StaffContext | null> => {
  const user = await getSessionUser()
  if (!user) return null
  const account = await getAccount()
  if (account.suspended) return null
  return { id: user.id, email: user.email, role: account.role }
})

/**
 * Situação de quem abriu o painel:
 *  - denied: sem papel na equipe (ou conta suspensa);
 *  - mfa: tem papel, mas esta sessão ainda não passou pelo aplicativo autenticador (aal2);
 *  - ok: pode usar o painel.
 * O banco exige a mesma coisa (private.actor_rank trata sessão sem aal2 como aluno); aqui só
 * escolhemos a tela certa.
 */
export type AdminAccess = { status: 'denied' } | { status: 'mfa'; ctx: StaffContext } | { status: 'ok'; ctx: StaffContext }

export const adminAccess = cache(async (): Promise<AdminAccess> => {
  const ctx = await baseContext()
  if (!ctx || !can(ctx.role, 'painel')) return { status: 'denied' }
  return (await getAal()) === 'aal2' ? { status: 'ok', ctx } : { status: 'mfa', ctx }
})

/** Quem está logado e qual o papel (null se não estiver logado). Equipe sem o 2º fator nesta sessão vale como ninguém. */
export const staffContext = cache(async (): Promise<StaffContext | null> => {
  const ctx = await baseContext()
  if (!ctx) return null
  if (ctx.role !== 'aluno' && (await getAal()) !== 'aal2') return null
  return ctx
})

/** O papel dá acesso a esta área? */
export async function allowed(perm: Perm) {
  const ctx = await staffContext()
  return ctx && can(ctx.role, perm) ? ctx : null
}

const role = z.enum(ROLE_KEYS as [Role, ...Role[]])
const ts = z.string().max(64)
const count = z.number().int().nonnegative()
const text = (max: number) => z.string().max(max)
const id = z.uuid()

async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    console.error('Falha no painel', { fn, code: error.code })
    throw new Error('Não foi possível carregar os dados do painel agora.')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta inesperada do banco', { fn })
    throw new Error('Não foi possível carregar os dados do painel agora.')
  }
  return parsed.data
}

// ---------- Visão geral ----------
const periodMetrics = z.object({
  newUsers: count,
  enrollments: count,
  lessons: count,
  works: count,
  activeUsers: count,
})
const overviewSchema = z.object({
  days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  from: ts,
  to: ts,
  prevFrom: ts,
  prevTo: ts,
  totalUsers: count,
  onboarded: count,
  suspended: count,
  staff: count,
  cur: periodMetrics,
  prev: periodMetrics,
  daily: z.array(z.object({ d: ts, newUsers: count, enrollments: count, lessons: count, active: count })).max(100),
  enrolled: z.array(z.object({ courseId: text(40), n: count })).max(500),
  lessonsHist: z.array(z.object({ courseId: text(40), lessons: count, users: count })).max(20000),
  recent: z
    .array(
      z.object({ at: ts, kind: text(40), target: text(400), by: text(400).nullable(), detail: text(700) }),
    )
    .max(40)
    .nullable(),
})
export type Overview = z.infer<typeof overviewSchema>

export const getOverview = cache((days: 7 | 30 | 90) => rpc('admin_overview', { p_days: days }, overviewSchema))

// ---------- Usuários ----------
const userRow = z.object({
  id,
  name: text(80),
  email: text(320),
  createdAt: ts,
  lastActiveAt: ts.nullable(),
  onboarded: z.boolean(),
  role,
  suspended: z.boolean(),
  courses: count,
  lessons: count,
})
export type UserRow = z.infer<typeof userRow>
const userListSchema = z.object({
  total: count,
  page: count,
  pageSize: count,
  rows: z.array(userRow).max(100),
  summary: z.object({ accounts: count, active7: count, suspended: count }),
})
export type UserList = z.infer<typeof userListSchema>

export const USER_FILTERS = {
  status: ['all', 'ativo', 'suspenso'],
  role: ['all', 'aluno', 'editor', 'admin', 'proprietario', 'equipe'],
  since: ['all', '7', '30', '90'],
  sort: ['created', 'active', 'name'],
} as const

export type UserFilters = {
  q: string
  status: (typeof USER_FILTERS.status)[number]
  role: (typeof USER_FILTERS.role)[number]
  since: (typeof USER_FILTERS.since)[number]
  sort: (typeof USER_FILTERS.sort)[number]
  page: number
}

const pickOne = <T extends string>(value: unknown, list: readonly T[], fallback: T): T =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback

/** Lê os filtros do endereço (?q=&status=...) aceitando só valores conhecidos. */
export function parseUserFilters(sp: Record<string, string | string[] | undefined>): UserFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k])
  const page = Number.parseInt(String(one('pagina') ?? '1'), 10)
  return {
    q: String(one('q') ?? '').slice(0, 100),
    status: pickOne(one('status'), USER_FILTERS.status, 'all'),
    role: pickOne(one('papel'), USER_FILTERS.role, 'all'),
    since: pickOne(one('desde'), USER_FILTERS.since, 'all'),
    sort: pickOne(one('ordem'), USER_FILTERS.sort, 'created'),
    page: Number.isFinite(page) && page >= 1 && page <= 10000 ? page : 1,
  }
}

export function listUsers(f: UserFilters) {
  return rpc(
    'admin_list_users',
    {
      p_search: f.q,
      p_status: f.status,
      p_role: f.role,
      p_since: f.since === 'all' ? null : Number(f.since),
      p_sort: f.sort,
      p_page: f.page - 1,
    },
    userListSchema,
  )
}

const detailSchema = z
  .object({
    id,
    name: text(80),
    email: text(320),
    createdAt: ts,
    lastSignInAt: ts.nullable(),
    onboarded: z.boolean(),
    stage: text(120).nullable(),
    goal: text(40).nullable(),
    role,
    suspension: z.object({ at: ts, reason: text(500), by: text(400).nullable() }).nullable(),
    lessons: count,
    works: count,
    skills: count,
    activeDays30: count,
    progress: z.array(z.object({ courseId: text(40), startedAt: ts.nullable(), done: count, lastAt: ts.nullable() })).max(200),
  })
  .nullable()
export type UserDetail = NonNullable<z.infer<typeof detailSchema>>

export const getUserDetail = cache((userId: string) => rpc('admin_user_detail', { p_user: userId }, detailSchema))

// ---------- Equipe e histórico ----------
const staffSchema = z
  .array(
    z.object({
      id,
      name: text(80).nullable(),
      email: text(320),
      role: role.exclude(['aluno']),
      grantedAt: ts,
      grantedBy: text(400).nullable(),
      suspended: z.boolean(),
    }),
  )
  .max(1000)
export type StaffMember = z.infer<typeof staffSchema>[number]
export const getStaff = cache(() => rpc('admin_staff', {}, staffSchema))

export const AUDIT_KINDS = ['all', 'permissao', 'usuario', 'conteudo'] as const
export type AuditKind = (typeof AUDIT_KINDS)[number]
const auditSchema = z
  .array(
    z.object({
      id: z.number().int(),
      at: ts,
      action: text(40),
      actor: text(400),
      actorRole: text(20),
      target: text(400),
      targetId: id.nullable(),
      detail: text(700),
    }),
  )
  .max(300)
export type AuditEntry = z.infer<typeof auditSchema>[number]
export const getAudit = cache((kind: AuditKind) => rpc('admin_audit_log', { p_kind: kind, p_limit: 200 }, auditSchema))
