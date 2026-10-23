'use server'

import { z } from 'zod'
import { allow } from '@/lib/security/rate-limit'
import { actionContext, type ActionResult, OK } from './shared'

/**
 * Sinais do player (audiência). Rodam SÓ no servidor e só gravam para a própria conta.
 * O banco confere tudo de novo: a aula precisa existir e estar visível, e o tempo creditado
 * por sinal nunca passa do tempo real desde o anterior (ninguém "inventa" horas assistidas).
 * Falha aqui nunca atrapalha a aula: o player ignora o resultado.
 */

const slug = z.string().regex(/^[a-z0-9-]{1,40}$/)
const schema = z.object({
  session: z.uuid(),
  course: slug,
  lesson: slug,
  event: z.enum(['play', 'beat', 'pause', 'end', 'leave']),
  position: z.number().min(0).max(86400),
  duration: z.number().min(0).max(86400),
  device: z.enum(['computador', 'celular', 'tablet']),
})

// ~1 sinal a cada 10 s é o normal; 40 por minuto dá folga para play/pause rápidos.
const RATE = { max: 40, windowMs: 60_000 }

export async function playerEventAction(input: unknown): Promise<ActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return OK
  const ctx = await actionContext()
  if (!ctx) return OK
  if (!allow('player:' + ctx.user.id, RATE)) return OK
  const p = parsed.data
  const { error } = await ctx.supabase.rpc('player_event', {
    p_session: p.session,
    p_course: p.course,
    p_lesson: p.lesson,
    p_event: p.event,
    p_position: Math.round(p.position),
    p_duration: Math.round(p.duration),
    p_device: p.device,
  })
  if (error && error.code !== 'FA404' && error.code !== 'FA403') console.error('Falha no sinal do player', { code: error.code })
  return OK
}
