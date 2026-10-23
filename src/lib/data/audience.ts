import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Dados de AUDIÊNCIA e RELATÓRIOS do painel (só servidor).
 * Tudo vem de funções do banco (admin_live, admin_report, admin_content_stats) que conferem o
 * papel de quem chamou. As respostas são conferidas com zod antes de ir para a tela.
 */

const ts = z.string().max(64)
const count = z.number().int().nonnegative()
const id = z.string().max(40)
const pct = z.number().min(0).max(100).nullable()

async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    console.error('Falha no painel', { fn, code: error.code })
    throw new Error('Não foi possível carregar os dados agora.')
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta inesperada do banco', { fn })
    throw new Error('Não foi possível carregar os dados agora.')
  }
  return parsed.data
}

// ---------- Ao vivo ----------
export const liveSchema = z.object({
  now: ts,
  views24h: count,
  analytics: z.object({ heartbeatSec: count, liveTimeoutSec: count, activeTimeoutSec: count, retentionDays: count }),
  sessions: z
    .array(
      z.object({
        id: z.uuid(),
        userId: z.uuid(),
        name: z.string().max(80),
        courseId: id,
        lessonId: id,
        state: z.enum(['playing', 'paused']),
        position: count,
        duration: count,
        device: z.string().max(20),
        startedAt: ts,
        lastBeat: ts,
      }),
    )
    .max(2000),
})
export type Live = z.infer<typeof liveSchema>
export const getLive = () => rpc('admin_live', {}, liveSchema)

// ---------- Contagens por curso/aula (lista de cursos e de aulas) ----------
const contentStatsSchema = z.object({
  courses: z.array(z.object({ id, enrolled: count, views: count, live: count })).max(2000),
  lessons: z.array(z.object({ id, views: count })).max(20000),
})
export type ContentStats = z.infer<typeof contentStatsSchema>
export const getContentStats = cache(() => rpc('admin_content_stats', {}, contentStatsSchema))
/** Igual, mas devolve null se falhar: as listas de cursos e aulas funcionam sem as contagens. */
export const getContentStatsOrNull = cache(() => getContentStats().catch(() => null))

// ---------- Relatório do período ----------
const reportSchema = z.object({
  from: z.string().max(10),
  to: z.string().max(10),
  usersBefore: count,
  daily: z.array(z.object({ d: z.string().max(10), newUsers: count, active: count, enrollments: count, completions: count })).max(400),
  courses: z.array(z.object({ id, enrolled: count, views: count, watched: count, completed: count, avgProgress: pct })).max(2000),
  lessons: z
    .array(z.object({ id, courseId: id, views: count, viewers: count, completed: count, watched: count, reach: pct }))
    .max(20000),
  activity: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().max(80),
        email: z.string().max(320),
        days: count,
        views: count,
        watched: count,
        last: ts.nullable(),
        suspended: z.boolean(),
      }),
    )
    .max(20000),
})
export type Report = z.infer<typeof reportSchema>
export const getReport = cache((from: string, to: string) => rpc('admin_report', { p_from: from, p_to: to }, reportSchema))
