import 'server-only'
import { createHash } from 'node:crypto'

/**
 * Bunny Stream (hospedagem e entrega do vídeo das aulas). SÓ servidor.
 *
 * Variáveis de ambiente (NUNCA no navegador, no banco nem em chat):
 *   BUNNY_STREAM_LIBRARY_ID  número da Video Library
 *   BUNNY_STREAM_API_KEY     "API Key" da Video Library (cria, consulta e apaga vídeos)
 *   BUNNY_STREAM_TOKEN_KEY   "Token Authentication Key" da Video Library (assina o endereço do player)
 *
 * Como funciona:
 *  - Envio: o navegador manda o arquivo direto para o Bunny (protocolo TUS) com uma ASSINATURA
 *    que este servidor gera para UM vídeo e que vale por 1 hora. A API Key nunca sai daqui.
 *  - Reprodução: o aluno recebe um endereço do player com um TOKEN que vale por algumas horas,
 *    gerado aqui só depois de conferir que ele pode ver a aula. Com "Block direct URL access"
 *    ligado na Video Library, o vídeo não abre sem esse token.
 */

const API = 'https://video.bunnycdn.com'
export const BUNNY_TUS_ENDPOINT = `${API}/tusupload`
export const BUNNY_EMBED_ORIGIN = 'https://iframe.mediadelivery.net'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isBunnyId = (v: unknown): v is string => typeof v === 'string' && GUID.test(v)

type Env = { libraryId: string; apiKey: string; tokenKey: string }

function env(): Env | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim() ?? ''
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim() ?? ''
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY?.trim() ?? ''
  if (!/^\d{1,12}$/.test(libraryId) || !apiKey || !tokenKey) return null
  return { libraryId, apiKey, tokenKey }
}

/** As três variáveis estão preenchidas? (Só diz sim ou não; nunca devolve valores.) */
export const bunnyConfigured = () => env() !== null

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

export type BunnyState = 'enviando' | 'processando' | 'pronto' | 'erro'
export type BunnyStatus = { state: BunnyState; progress: number; length: number }

/** Mapa dos códigos de status do Bunny para os que a tela mostra. */
function stateOf(code: number): BunnyState {
  if (code === 4) return 'pronto'
  if (code === 5 || code === 6) return 'erro'
  if (code === 2 || code === 3 || code === 7 || code === 8 || code === 1) return 'processando'
  return 'enviando'
}

async function call(path: string, init: RequestInit & { json?: unknown } = {}) {
  const cfg = env()
  if (!cfg) throw new Error('bunny-not-configured')
  const res = await fetch(`${API}/library/${cfg.libraryId}${path}`, {
    method: init.method ?? 'GET',
    headers: { AccessKey: cfg.apiKey, Accept: 'application/json', ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
    body: init.json ? JSON.stringify(init.json) : undefined,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  return res
}

/** Cria o "espaço" do vídeo no Bunny e devolve o id (GUID). */
export async function createBunnyVideo(title: string): Promise<string> {
  const res = await call('/videos', { method: 'POST', json: { title: title.slice(0, 120) } })
  if (!res.ok) throw new Error(`bunny-create-${res.status}`)
  const body = (await res.json()) as { guid?: unknown }
  if (!isBunnyId(body.guid)) throw new Error('bunny-create-bad-response')
  return body.guid
}

export async function getBunnyStatus(id: string): Promise<BunnyStatus | null> {
  if (!isBunnyId(id)) return null
  const res = await call(`/videos/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`bunny-get-${res.status}`)
  const v = (await res.json()) as { status?: unknown; encodeProgress?: unknown; length?: unknown }
  const code = typeof v.status === 'number' ? v.status : 0
  return {
    state: stateOf(code),
    progress: Math.min(100, Math.max(0, Math.round(Number(v.encodeProgress) || 0))),
    length: Math.max(0, Math.round(Number(v.length) || 0)),
  }
}

export async function deleteBunnyVideo(id: string): Promise<void> {
  if (!isBunnyId(id)) return
  const res = await call(`/videos/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 404) throw new Error(`bunny-delete-${res.status}`)
}

/** Assinatura para o navegador enviar UM vídeo por TUS (vale por 1 hora). */
export function bunnyUploadTicket(videoId: string) {
  const cfg = env()
  if (!cfg) throw new Error('bunny-not-configured')
  const expire = Math.floor(Date.now() / 1000) + 3600
  return {
    endpoint: BUNNY_TUS_ENDPOINT,
    libraryId: cfg.libraryId,
    videoId,
    expire,
    signature: sha256(cfg.libraryId + cfg.apiKey + expire + videoId),
  }
}

/** Endereço do player com token (vale por 4 horas). null = Bunny não configurado. */
export function bunnyEmbedUrl(videoId: string, ttlSec = 4 * 3600): string | null {
  const cfg = env()
  if (!cfg || !isBunnyId(videoId)) return null
  const expires = Math.floor(Date.now() / 1000) + ttlSec
  const token = sha256(cfg.tokenKey + videoId + expires)
  const params = new URLSearchParams({ token, expires: String(expires), autoplay: 'false', preload: 'true', responsive: 'true' })
  return `${BUNNY_EMBED_ORIGIN}/embed/${cfg.libraryId}/${videoId}?${params}`
}
