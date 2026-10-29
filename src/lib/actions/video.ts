'use server'

import { z } from 'zod'
import { allowed } from '@/lib/data/admin'
import { allow } from '@/lib/security/rate-limit'
import { bunnyConfigured, bunnyUploadTicket, createBunnyVideo, deleteBunnyVideo, getBunnyStatus, isBunnyId, type BunnyStatus } from '@/lib/bunny'
import { ADMIN_RATE, TOO_MANY, type AdminFailure } from './admin-shared'
import { actionContext, EXPIRED, FAILED, INVALID } from './shared'

/**
 * Vídeo das aulas no Bunny Stream (rodam SÓ no servidor). A chave do Bunny nunca vai para o
 * navegador: ele recebe apenas uma assinatura que vale para UM vídeo e por 1 hora.
 * Quem pode: editor ou acima (conferido aqui pelo papel gravado no banco).
 */

type Fail = AdminFailure
const NOT_CONFIGURED: Fail = { ok: false, error: 'O Bunny Stream ainda não está configurado neste ambiente. Use um vídeo por link ou fale com quem cuida do servidor.' }
const DENIED: Fail = { ok: false, error: 'Seu papel não dá acesso a esta ação.', code: 'FA403' }

async function gate() {
  const ctx = await actionContext()
  if (!ctx) return { fail: EXPIRED as Fail }
  if (!(await allowed('conteudo'))) return { fail: DENIED }
  if (!allow('video:' + ctx.user.id, ADMIN_RATE)) return { fail: TOO_MANY as Fail }
  return { ctx }
}

export type UploadTicket = { ok: true; endpoint: string; libraryId: string; videoId: string; expire: number; signature: string } | Fail

/** Cria o vídeo no Bunny e devolve a assinatura de envio (TUS). */
export async function createVideoUploadAction(input: unknown): Promise<UploadTicket> {
  const parsed = z.object({ title: z.string().trim().min(1).max(120), size: z.number().int().min(1).max(10 * 1024 ** 3) }).safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  if (!bunnyConfigured()) return NOT_CONFIGURED
  try {
    const videoId = await createBunnyVideo(parsed.data.title)
    return { ok: true, ...bunnyUploadTicket(videoId) }
  } catch (error) {
    console.error('Falha ao criar vídeo no Bunny', { error: error instanceof Error ? error.message : 'erro' })
    return FAILED
  }
}

/** Reenvia a assinatura de um vídeo já criado (se o envio demorou mais de 1 hora). */
export async function renewVideoUploadAction(input: unknown): Promise<UploadTicket> {
  const parsed = z.object({ id: z.string() }).safeParse(input)
  if (!parsed.success || !isBunnyId(parsed.data.id)) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  if (!bunnyConfigured()) return NOT_CONFIGURED
  return { ok: true, ...bunnyUploadTicket(parsed.data.id) }
}

export type VideoStatusResult = ({ ok: true } & BunnyStatus) | Fail

/** Em que pé está o vídeo no Bunny (enviando, processando, pronto ou com erro). */
export async function getVideoStatusAction(input: unknown): Promise<VideoStatusResult> {
  const parsed = z.object({ id: z.string() }).safeParse(input)
  if (!parsed.success || !isBunnyId(parsed.data.id)) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  if (!bunnyConfigured()) return NOT_CONFIGURED
  try {
    const status = await getBunnyStatus(parsed.data.id)
    if (!status) return { ok: false, error: 'Esse vídeo não existe mais no Bunny.' }
    return { ok: true, ...status }
  } catch {
    return { ok: false, error: 'Não foi possível consultar o Bunny agora.' }
  }
}

/**
 * Apaga um vídeo do Bunny (envio que foi trocado ou cancelado antes de salvar o curso).
 * Recusa se alguma aula do banco ainda usa o vídeo.
 */
export async function deleteVideoAction(input: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ id: z.string() }).safeParse(input)
  if (!parsed.success || !isBunnyId(parsed.data.id)) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  if (!bunnyConfigured()) return NOT_CONFIGURED
  // A coluna do vídeo não é lida direto (SQL do cupom de lançamento): lesson_videos() entrega todos para a equipe.
  const { data: videos, error } = await ctx.supabase.rpc('lesson_videos')
  let inUse: boolean
  if (!error) {
    inUse = Array.isArray(videos) && videos.some((v) => (v as { bunny_video_id?: unknown })?.bunny_video_id === parsed.data.id)
  } else if (error.code === 'PGRST202') {
    // Banco ainda sem o SQL do cupom: lê como antes.
    const old = await ctx.supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('bunny_video_id', parsed.data.id)
    if (old.error) return FAILED
    inUse = (old.count ?? 0) > 0
  } else {
    return FAILED
  }
  if (inUse) return { ok: false, error: 'Este vídeo ainda é usado por uma aula.' }
  try {
    await deleteBunnyVideo(parsed.data.id)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Não foi possível apagar o vídeo no Bunny agora.' }
  }
}
