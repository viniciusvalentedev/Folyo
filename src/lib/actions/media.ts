'use server'

import { z } from 'zod'
import { FILE_BUCKET, IMAGE_BUCKET, IMAGE_EXTS, isPdfHead, MAX_FILE_BYTES, MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, cleanMediaName, sniffImage } from '@/lib/media'
import { supabaseEnv } from '@/lib/supabase/config'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY, type AdminFailure } from './admin-shared'
import { actionContext, EXPIRED, FAILED, INVALID, type ActionContext } from './shared'

/**
 * Biblioteca de mídia (imagens e PDFs). Rodam SÓ no servidor.
 *
 * O arquivo é grande demais para passar pelo servidor da Vercel (limite de ~4,5 MB por pedido),
 * então o fluxo tem 3 passos, como o envio de PDF do aluno:
 *   1. `prepareMediaUploadAction`: confere o pedido e devolve um endereço de envio válido para
 *      UM arquivo, com nome definido pelo servidor (`<id>/<versão>.<extensão>`);
 *   2. o navegador envia o arquivo direto para o Storage (os buckets só aceitam os tipos e
 *      tamanhos certos, e só a equipe consegue gravar);
 *   3. `confirm...`: o servidor LÊ o começo do arquivo enviado, confere se o conteúdo é do tipo
 *      anunciado (PNG/JPG/WebP ou PDF) e só então registra na biblioteca (o banco confere o
 *      papel, o tamanho e o tipo reais do objeto). Arquivo que não passa é apagado na hora.
 * Quem pode: editor ou acima (conferido pelo banco em cada função admin_*).
 */

type Fail = AdminFailure
const FILE_MISSING: Fail = { ok: false, error: 'Não encontramos o arquivo enviado. Tente enviar de novo.' }
const BAD_CONTENT: Fail = { ok: false, error: 'O conteúdo do arquivo não confere com o tipo escolhido. Use PNG, JPG, WebP ou PDF.' }

const exts = [...IMAGE_EXTS, 'pdf'] as const
const extSchema = z.enum(exts)
const uuid = z.uuid()
const dim = z.number().int().min(1).max(MAX_IMAGE_SIDE).nullable()

const bucketOf = (ext: (typeof exts)[number]) => (ext === 'pdf' ? FILE_BUCKET : IMAGE_BUCKET)
const pathOf = (mediaId: string, version: string, ext: string) => `${mediaId}/${version}.${ext}`

async function gate() {
  const ctx = await actionContext()
  if (!ctx) return { fail: EXPIRED as Fail }
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return { fail: TOO_MANY as Fail }
  return { ctx }
}

async function removeObject(ctx: ActionContext, bucket: string, path: string | null) {
  if (!path) return
  const { error } = await ctx.supabase.storage.from(bucket).remove([path])
  if (error) console.error('Falha ao apagar arquivo do Storage', { bucket })
}

/** Lê os primeiros bytes do objeto enviado (o conteúdo que vale é o do Storage, não o que a tela disse). */
async function readHead(ctx: ActionContext, bucket: string, path: string): Promise<{ ok: true; head: Uint8Array; size: number } | Fail> {
  const { data, error } = await ctx.supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data) return FILE_MISSING
  // Prazo de 10 s para o pedido inteiro: sem ele, um Storage que não responde (ou não corta o
  // download) deixava o envio da imagem "Enviando…" para sempre.
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), 10_000)
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-15' }, cache: 'no-store', signal: abort.signal })
    if (res.status !== 200 && res.status !== 206) return FILE_MISSING
    const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
    const size = Number(range ? range[1] : res.headers.get('content-length'))
    const reader = res.body?.getReader()
    if (!reader) return FILE_MISSING
    const bytes: number[] = []
    while (bytes.length < 16) {
      const { done, value } = await reader.read()
      if (done) break
      for (const b of value) bytes.push(b)
    }
    // Já temos o começo: corta o resto do download sem ficar esperando o cancelamento
    // (esperar por ele podia travar quando o servidor ignora o "Range" e manda o arquivo inteiro).
    abort.abort()
    return { ok: true, head: Uint8Array.from(bytes.slice(0, 16)), size: Number.isFinite(size) ? size : 0 }
  } catch {
    console.error('Falha ao ler o começo do arquivo enviado', { bucket })
    return FILE_MISSING
  } finally {
    clearTimeout(timer)
  }
}

/** O conteúdo é mesmo do tipo da extensão? */
function contentMatches(ext: (typeof exts)[number], head: Uint8Array) {
  return ext === 'pdf' ? isPdfHead(head) : sniffImage(head) === ext
}

// ---------- Passo 1: preparar o envio ----------

const prepareSchema = z.object({
  ext: extSchema,
  size: z.number().int().min(5),
  /** Preenchido ao SUBSTITUIR um arquivo que já existe na biblioteca. */
  replaceId: uuid.optional(),
})

export type MediaTicket = { ok: true; mediaId: string; version: string; uploadUrl: string; apiKey: string; bucket: string } | Fail

export async function prepareMediaUploadAction(input: unknown): Promise<MediaTicket> {
  const parsed = prepareSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { ext, size, replaceId } = parsed.data
  if (size > (ext === 'pdf' ? MAX_FILE_BYTES : MAX_IMAGE_BYTES)) {
    return { ok: false, error: ext === 'pdf' ? 'O PDF passa de 20 MB.' : 'A imagem passa de 5 MB.' }
  }
  const { fail, ctx } = await gate()
  if (!ctx) return fail

  const mediaId = replaceId ?? crypto.randomUUID()
  const version = crypto.randomUUID()
  const bucket = bucketOf(ext)
  const signed = await ctx.supabase.storage.from(bucket).createSignedUploadUrl(pathOf(mediaId, version, ext))
  if (signed.error || !signed.data) {
    console.error('Falha ao preparar o envio de mídia', { name: signed.error?.name })
    return FAILED
  }
  return { ok: true, mediaId, version, uploadUrl: signed.data.signedUrl, apiKey: supabaseEnv().key, bucket }
}

// ---------- Passo 3: conferir e registrar ----------

const confirmSchema = z.object({
  mediaId: uuid,
  version: uuid,
  ext: extSchema,
  name: z.string().min(1).max(300).optional(),
  width: dim.default(null),
  height: dim.default(null),
})

export type RegisterResult = { ok: true; id: string } | Fail

/** Arquivo NOVO na biblioteca. */
export async function confirmMediaUploadAction(input: unknown): Promise<RegisterResult> {
  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success || !parsed.data.name) return INVALID
  const { mediaId, version, ext, name, width, height } = parsed.data
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const bucket = bucketOf(ext)
  const path = pathOf(mediaId, version, ext)

  const head = await readHead(ctx, bucket, path)
  if (!head.ok) return head
  if (!contentMatches(ext, head.head)) {
    await removeObject(ctx, bucket, path)
    return BAD_CONTENT
  }
  const { error } = await ctx.supabase.rpc('admin_register_media', {
    p_id: mediaId,
    p_path: path,
    p_name: cleanMediaName(name, ext === 'pdf' ? 'documento.pdf' : 'imagem'),
    p_width: ext === 'pdf' ? null : width,
    p_height: ext === 'pdf' ? null : height,
  })
  if (error) {
    await removeObject(ctx, bucket, path)
    return fromDb('admin_register_media', ctx.user.id, error)
  }
  return { ok: true, id: mediaId }
}

/** Troca o arquivo de um item que já existe (todos os cursos que o usam passam a mostrar o novo). */
export async function confirmReplaceMediaAction(input: unknown): Promise<RegisterResult> {
  const parsed = confirmSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { mediaId, version, ext, width, height } = parsed.data
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const bucket = bucketOf(ext)
  const path = pathOf(mediaId, version, ext)

  const head = await readHead(ctx, bucket, path)
  if (!head.ok) return head
  if (!contentMatches(ext, head.head)) {
    await removeObject(ctx, bucket, path)
    return BAD_CONTENT
  }
  const { data, error } = await ctx.supabase.rpc('admin_replace_media', {
    p_id: mediaId,
    p_path: path,
    p_width: ext === 'pdf' ? null : width,
    p_height: ext === 'pdf' ? null : height,
  })
  if (error) {
    await removeObject(ctx, bucket, path)
    return fromDb('admin_replace_media', ctx.user.id, error)
  }
  const old = z.object({ oldPath: z.string().max(120).nullable() }).safeParse(data)
  // O arquivo antigo só sai depois que o novo já está valendo.
  if (old.success) await removeObject(ctx, bucket, old.data.oldPath)
  return { ok: true, id: mediaId }
}

// ---------- Nome e texto alternativo ----------

const updateSchema = z.object({ id: uuid, name: z.string().trim().min(1).max(120), alt: z.string().trim().max(160) })

export async function updateMediaAction(input: unknown): Promise<{ ok: true } | Fail> {
  const parsed = updateSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_update_media', { p_id: parsed.data.id, p_name: cleanMediaName(parsed.data.name), p_alt: parsed.data.alt })
  return error ? fromDb('admin_update_media', ctx.user.id, error) : { ok: true }
}

// ---------- Excluir ----------

export async function deleteMediaAction(input: unknown): Promise<{ ok: true } | Fail> {
  const parsed = z.object({ id: uuid }).safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  // O banco recusa se o arquivo ainda é usado por algum curso, categoria ou material.
  const { data, error } = await ctx.supabase.rpc('admin_delete_media', { p_id: parsed.data.id })
  if (error) return fromDb('admin_delete_media', ctx.user.id, error)
  const info = z.object({ path: z.string().max(120), kind: z.enum(['image', 'file']) }).safeParse(data)
  if (info.success) await removeObject(ctx, info.data.kind === 'file' ? FILE_BUCKET : IMAGE_BUCKET, info.data.path)
  return { ok: true }
}
