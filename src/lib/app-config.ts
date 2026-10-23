import { z } from 'zod'

/**
 * Configurações da plataforma (painel → Configurações).
 *
 * Vale no servidor e no navegador. Os mesmos limites existem no banco
 * (supabase/migrations/20261025000001_*.sql → `admin_save_config`), que confere de novo.
 * O que o aluno precisa saber (nome, frase da entrada, e-mail de suporte, ordenação e selo
 * do plano) sai por `public_config()`; o resto só o administrador lê.
 */

export const SORTS = ['relevancia', 'catalogo', 'curtos'] as const
export type CatalogSort = (typeof SORTS)[number]
export const SORT_LABELS: Record<CatalogSort, string> = {
  relevancia: 'Relevância (objetivo do aluno, destaques, recomendados)',
  catalogo: 'Ordem do catálogo',
  curtos: 'Mais curtos primeiro',
}

export const CONFIG_LIMITS = {
  name: { min: 1, max: 40 },
  tagline: 160,
  supportEmail: 120,
  pageSize: { min: 5, max: 50 },
  draftStaleDays: { min: 1, max: 365 },
  heartbeatSec: { min: 10, max: 60 },
  liveTimeoutSec: { max: 300 },
  activeTimeoutSec: { min: 60, max: 900 },
  retentionDays: { min: 30, max: 730 },
} as const

export const DEFAULT_CONFIG = {
  name: 'Folyo',
  tagline: 'Cursos práticos, projetos reais e um currículo que mostra o que você sabe fazer.',
  supportEmail: '',
  catalog: { pageSize: 12, defaultSort: 'relevancia' as CatalogSort, showPlanBadge: true },
  publishing: { requireCoverToPublish: true },
  notifications: { draftStaleDays: 14, alertMissingVideo: true },
  analytics: { heartbeatSec: 15, liveTimeoutSec: 45, activeTimeoutSec: 120, retentionDays: 180 },
}
export type AppConfig = typeof DEFAULT_CONFIG

const L = CONFIG_LIMITS
const int = (min: number, max: number) => z.number().int().min(min).max(max)

export const configSchema = z
  .object({
    name: z.string().trim().min(L.name.min).max(L.name.max),
    tagline: z.string().max(L.tagline),
    supportEmail: z.string().trim().max(L.supportEmail).regex(/^$|^\S+@\S+\.\S+$/),
    catalog: z.object({
      pageSize: int(L.pageSize.min, L.pageSize.max),
      defaultSort: z.enum(SORTS),
      showPlanBadge: z.boolean(),
    }),
    publishing: z.object({ requireCoverToPublish: z.boolean() }),
    notifications: z.object({ draftStaleDays: int(L.draftStaleDays.min, L.draftStaleDays.max), alertMissingVideo: z.boolean() }),
    analytics: z.object({
      heartbeatSec: int(L.heartbeatSec.min, L.heartbeatSec.max),
      liveTimeoutSec: int(20, L.liveTimeoutSec.max),
      activeTimeoutSec: int(L.activeTimeoutSec.min, L.activeTimeoutSec.max),
      retentionDays: int(L.retentionDays.min, L.retentionDays.max),
    }),
  })
  .refine((c) => c.analytics.liveTimeoutSec >= c.analytics.heartbeatSec * 2, { path: ['analytics', 'liveTimeoutSec'] })

/** Erros por campo (para a tela). Chaves iguais às do protótipo. */
export type ConfigErrors = Partial<Record<'name' | 'supportEmail' | 'pageSize' | 'draftStaleDays' | 'heartbeatSec' | 'liveTimeoutSec' | 'activeTimeoutSec' | 'retentionDays', string>>

export function validateConfig(c: AppConfig): ConfigErrors {
  const e: ConfigErrors = {}
  if (!c.name.trim()) e.name = 'Informe o nome da plataforma.'
  if (c.supportEmail && !/^\S+@\S+\.\S+$/.test(c.supportEmail)) e.supportEmail = 'E-mail inválido.'
  const a = c.analytics
  if (!(a.heartbeatSec >= L.heartbeatSec.min && a.heartbeatSec <= L.heartbeatSec.max)) e.heartbeatSec = 'Entre 10 e 60 segundos.'
  if (!(a.liveTimeoutSec >= a.heartbeatSec * 2 && a.liveTimeoutSec <= L.liveTimeoutSec.max)) {
    e.liveTimeoutSec = `Pelo menos o dobro do intervalo do sinal (${a.heartbeatSec * 2} s) e no máximo 300 s.`
  }
  if (!(a.activeTimeoutSec >= L.activeTimeoutSec.min && a.activeTimeoutSec <= L.activeTimeoutSec.max)) e.activeTimeoutSec = 'Entre 60 e 900 segundos.'
  if (!(a.retentionDays >= L.retentionDays.min && a.retentionDays <= L.retentionDays.max)) e.retentionDays = 'Entre 30 e 730 dias.'
  if (!(c.notifications.draftStaleDays >= 1 && c.notifications.draftStaleDays <= 365)) e.draftStaleDays = 'Entre 1 e 365 dias.'
  if (!(c.catalog.pageSize >= L.pageSize.min && c.catalog.pageSize <= L.pageSize.max)) e.pageSize = 'Entre 5 e 50.'
  return e
}

/** O que qualquer pessoa pode ler (inclusive sem login). */
export type PublicConfig = {
  name: string
  tagline: string
  supportEmail: string
  catalog: { showPlanBadge: boolean; defaultSort: CatalogSort }
  /** Regra de publicação e avisos (a equipe do painel usa; não tem nada sigiloso). */
  requireCover: boolean
  notifications: { draftStaleDays: number; alertMissingVideo: boolean }
  heartbeatSec: number
}

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  name: DEFAULT_CONFIG.name,
  tagline: DEFAULT_CONFIG.tagline,
  supportEmail: DEFAULT_CONFIG.supportEmail,
  catalog: { showPlanBadge: DEFAULT_CONFIG.catalog.showPlanBadge, defaultSort: DEFAULT_CONFIG.catalog.defaultSort },
  requireCover: DEFAULT_CONFIG.publishing.requireCoverToPublish,
  notifications: { ...DEFAULT_CONFIG.notifications },
  heartbeatSec: DEFAULT_CONFIG.analytics.heartbeatSec,
}

export const publicConfigSchema = z.object({
  name: z.string().min(1).max(L.name.max),
  tagline: z.string().max(L.tagline),
  supportEmail: z.string().max(L.supportEmail),
  catalog: z.object({ showPlanBadge: z.boolean(), defaultSort: z.enum(SORTS) }),
  requireCover: z.boolean(),
  notifications: z.object({ draftStaleDays: int(L.draftStaleDays.min, L.draftStaleDays.max), alertMissingVideo: z.boolean() }),
  heartbeatSec: int(L.heartbeatSec.min, L.heartbeatSec.max),
})

/** E-mail de contato que aparece para o aluno (se a equipe não preencheu, usa o padrão da Folyo). */
export const FALLBACK_SUPPORT_EMAIL = 'contato@usefolyo.com'
export const supportEmailOf = (c: Pick<PublicConfig, 'supportEmail'>) => c.supportEmail || FALLBACK_SUPPORT_EMAIL
