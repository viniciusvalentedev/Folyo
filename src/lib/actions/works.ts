'use server'

import { getCatalog } from '@/lib/data/catalog'
import { findCourse } from '@/lib/domain/catalog'
import { WORK_COLUMNS, workFromRow, type WorkRow } from '@/lib/domain/student-state'
import type { Work } from '@/lib/types'
import {
  MAX_PDF_BYTES,
  MAX_PDFS,
  MAX_WORKS,
  normalizeWorkUrl,
  pdfConfirmNewSchema,
  pdfConfirmReplaceSchema,
  pdfUploadRequestSchema,
  uuidSchema,
  workEditSchema,
  WORK_TITLE_MAX,
} from '@/lib/validation'
import { supabaseEnv } from '@/lib/supabase/config'
import { actionContext, dbFailure, EXPIRED, FAILED, INVALID, OK, type ActionContext, type ActionFailure, type ActionResult } from './shared'

/**
 * Trabalhos do aluno: links e PDFs anexados aos cursos (ou "fora da Folyo").
 *
 * PDFs: o arquivo é grande demais para passar pelo servidor da Vercel (limite de 4,5 MB
 * por pedido), então o fluxo tem 3 passos:
 *   1. `preparePdfUploadAction`: o servidor confere os limites e devolve um endereço de
 *      envio válido só para UM arquivo, com nome definido por ele, na pasta do aluno;
 *   2. o navegador envia o PDF direto para o bucket PRIVADO do Storage (o bucket só aceita
 *      PDF de até 20 MB, e as regras do banco só deixam gravar na pasta do próprio aluno);
 *   3. `confirmNewPdfAction` / `confirmReplacePdfAction`: o servidor LÊ o arquivo enviado,
 *      confere se é mesmo um PDF (assinatura "%PDF-") e o tamanho real, e só então cria o
 *      trabalho. Arquivo que não passa é apagado na hora.
 * Para ver o PDF, a tela usa a rota /api/trabalhos/<id>/arquivo (só o dono abre).
 */

const BUCKET = 'student-works'
const PDF_QUOTA_BYTES = 300 * 1024 * 1024
/** Envios que ninguém confirmou são apagados depois de 1 hora. */
const ORPHAN_AFTER_MS = 60 * 60 * 1000

export type WorkResult = { ok: true; work: Work } | { ok: false; error: string }
/** `apiKey` é a chave PÚBLICA (publishable) do Supabase: o Storage pede esse cabeçalho no envio. */
export type UploadTicket = { ok: true; fileId: string; uploadUrl: string; apiKey: string } | { ok: false; error: string }

const NOT_A_PDF: ActionFailure = { ok: false, error: 'Este arquivo não parece ser um PDF válido.' }
const FILE_MISSING: ActionFailure = { ok: false, error: 'Não encontramos o arquivo enviado. Tente enviar de novo.' }

const pathOf = (userId: string, fileId: string) => `${userId}/${fileId}.pdf`

/** Nome do arquivo para mostrar: sem pastas, sem caracteres de controle, até 200 letras. */
function cleanFileName(raw: string) {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const name = base.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim()
  return (name || 'documento.pdf').slice(-200)
}

/** Título sugerido a partir do nome do arquivo ("plano_de_marketing.pdf" → "plano de marketing"). */
function titleFromFile(name: string) {
  return (
    name
      .replace(/\.pdf$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .slice(0, WORK_TITLE_MAX) || 'Documento'
  )
}

async function removeObjects(ctx: ActionContext, paths: string[]) {
  if (!paths.length) return
  const { error } = await ctx.supabase.storage.from(BUCKET).remove(paths)
  if (error) console.error('Falha ao apagar arquivo do Storage', { count: paths.length })
}

/** Apaga os envios da pasta do aluno que nunca viraram trabalho. Devolve quantos arquivos sobraram. */
async function cleanOrphans(ctx: ActionContext, referenced: Set<string>) {
  const { data, error } = await ctx.supabase.storage.from(BUCKET).list(ctx.user.id, { limit: 100 })
  if (error || !data) return 0
  const now = Date.now()
  const orphans = data
    .filter((o) => {
      const created = o.created_at ? Date.parse(o.created_at) : NaN
      return !referenced.has(pathOf(ctx.user.id, o.name.replace(/\.pdf$/, ''))) && Number.isFinite(created) && now - created > ORPHAN_AFTER_MS
    })
    .map((o) => `${ctx.user.id}/${o.name}`)
  await removeObjects(ctx, orphans)
  return data.length - orphans.length
}

/**
 * Lê o começo do arquivo enviado: confere a assinatura de PDF e descobre o tamanho real
 * (o que a tela disse não vale: quem manda é o Storage).
 */
async function inspectPdf(ctx: ActionContext, path: string): Promise<{ ok: true; size: number } | { ok: false; error: string }> {
  const { data, error } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error || !data) return FILE_MISSING
  let res: Response
  try {
    res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-4' }, cache: 'no-store' })
  } catch {
    return FILE_MISSING
  }
  if (res.status !== 200 && res.status !== 206) return FILE_MISSING

  const range = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '')
  const size = Number(range ? range[1] : res.headers.get('content-length'))

  // Lê só os primeiros bytes (se o servidor ignorar o "Range", não baixamos o arquivo inteiro).
  const reader = res.body?.getReader()
  if (!reader) return FILE_MISSING
  const chunks: number[] = []
  while (chunks.length < 5) {
    const { done, value } = await reader.read()
    if (done) break
    for (const b of value) chunks.push(b)
  }
  await reader.cancel().catch(() => {})

  if (String.fromCharCode(...chunks.slice(0, 5)) !== '%PDF-') return NOT_A_PDF
  if (!Number.isInteger(size) || size < 5 || size > MAX_PDF_BYTES) {
    return { ok: false, error: 'O arquivo é maior que o limite de 20 MB.' }
  }
  return { ok: true, size }
}

/** Passo 1: confere os limites e devolve o endereço de envio de um único arquivo. */
export async function preparePdfUploadAction(input: unknown): Promise<UploadTicket> {
  const parsed = pdfUploadRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID.error }
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  const { data: rows, error } = await ctx.supabase
    .from('works')
    .select('kind, file_path, file_size')
    .eq('user_id', ctx.user.id)
    .limit(MAX_WORKS + 20)
  if (error) return dbFailure('works.quota', error)
  const works = rows ?? []
  const pdfs = works.filter((w) => w.kind === 'pdf')
  if (works.length >= MAX_WORKS) return { ok: false, error: `Você chegou ao limite de ${MAX_WORKS} materiais. Apague alguns para enviar novos.` }
  if (pdfs.length >= MAX_PDFS) return { ok: false, error: `Você chegou ao limite de ${MAX_PDFS} PDFs. Apague alguns para enviar novos.` }
  const used = pdfs.reduce((sum, w) => sum + (w.file_size ?? 0), 0)
  if (used + parsed.data.size > PDF_QUOTA_BYTES) {
    return { ok: false, error: 'Seu espaço de arquivos (300 MB) está cheio. Apague PDFs que não usa mais.' }
  }

  const remaining = await cleanOrphans(ctx, new Set(pdfs.map((w) => String(w.file_path))))
  if (remaining >= 55) return { ok: false, error: 'Há muitos arquivos aguardando confirmação. Tente de novo em alguns minutos.' }

  const fileId = crypto.randomUUID()
  const signed = await ctx.supabase.storage.from(BUCKET).createSignedUploadUrl(pathOf(ctx.user.id, fileId))
  if (signed.error || !signed.data) {
    console.error('Falha ao preparar o envio do PDF', { name: signed.error?.name })
    return FAILED
  }
  return { ok: true, fileId, uploadUrl: signed.data.signedUrl, apiKey: supabaseEnv().key }
}

/** Passo 3 (trabalho novo): confere o arquivo enviado e cria o trabalho. */
export async function confirmNewPdfAction(input: unknown): Promise<WorkResult> {
  const parsed = pdfConfirmNewSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fileId, courseId, fileName, title } = parsed.data
  if (courseId && !findCourse(await getCatalog(), courseId)) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  const path = pathOf(ctx.user.id, fileId)
  const checked = await inspectPdf(ctx, path)
  if (!checked.ok) {
    await removeObjects(ctx, [path])
    return checked
  }
  const name = cleanFileName(fileName)
  const { data, error } = await ctx.supabase
    .from('works')
    .insert({
      id: crypto.randomUUID(),
      course_id: courseId,
      kind: 'pdf',
      title: title || titleFromFile(name),
      file_path: path,
      file_name: name,
      file_size: checked.size,
    })
    .select(WORK_COLUMNS)
    .single()
  if (error || !data) {
    await removeObjects(ctx, [path])
    return dbFailure('works.insert-pdf', error)
  }
  const work = workFromRow(data as unknown as WorkRow)
  return work ? { ok: true, work } : FAILED
}

/** Passo 3 (trocar o PDF de um trabalho que já existe). */
export async function confirmReplacePdfAction(input: unknown): Promise<WorkResult> {
  const parsed = pdfConfirmReplaceSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fileId, workId, fileName } = parsed.data
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  const path = pathOf(ctx.user.id, fileId)
  const { data: current, error: readError } = await ctx.supabase
    .from('works')
    .select('file_path, kind')
    .eq('user_id', ctx.user.id)
    .eq('id', workId)
    .maybeSingle()
  if (readError) {
    await removeObjects(ctx, [path])
    return dbFailure('works.read', readError)
  }
  if (!current || current.kind !== 'pdf') {
    await removeObjects(ctx, [path])
    return INVALID
  }

  const checked = await inspectPdf(ctx, path)
  if (!checked.ok) {
    await removeObjects(ctx, [path])
    return checked
  }
  const { data, error } = await ctx.supabase
    .from('works')
    .update({ file_path: path, file_name: cleanFileName(fileName), file_size: checked.size })
    .eq('user_id', ctx.user.id)
    .eq('id', workId)
    .select(WORK_COLUMNS)
    .single()
  if (error || !data) {
    await removeObjects(ctx, [path])
    return dbFailure('works.replace-pdf', error)
  }
  if (current.file_path) await removeObjects(ctx, [current.file_path])
  const work = workFromRow(data as unknown as WorkRow)
  return work ? { ok: true, work } : FAILED
}

/**
 * Cria ou atualiza um LINK, ou atualiza título, descrição e visibilidade de qualquer
 * trabalho. O arquivo de um PDF nunca passa por aqui (só pelos passos de envio acima).
 */
export async function saveWorkAction(input: unknown): Promise<ActionResult> {
  const parsed = workEditSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const w = parsed.data
  if (w.courseId && !findCourse(await getCatalog(), w.courseId)) return INVALID
  let url: string | null = null
  if (w.kind === 'link') {
    const checked = normalizeWorkUrl(w.url ?? '')
    if ('error' in checked) return { ok: false, error: checked.error }
    url = checked.url
  }
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  const changes = { title: w.title, description: w.desc, is_public: w.public, in_cv: w.inCV }

  if (w.kind === 'pdf') {
    const { data, error } = await ctx.supabase.from('works').update(changes).eq('user_id', ctx.user.id).eq('id', w.id).select('id')
    if (error) return dbFailure('works.update-pdf', error)
    return data.length ? OK : { ok: false, error: 'Este material não existe mais. Recarregue a página.' }
  }

  const update = () =>
    ctx.supabase.from('works').update({ ...changes, url }).eq('user_id', ctx.user.id).eq('id', w.id).select('id')
  const first = await update()
  if (first.error) return dbFailure('works.update', first.error)
  if (first.data.length) return OK

  const inserted = await ctx.supabase
    .from('works')
    .insert({ id: w.id, course_id: w.courseId, kind: 'link', ...changes, url })
  if (!inserted.error) return OK
  if (inserted.error.code === '23505') {
    const again = await update()
    if (!again.error && again.data.length) return OK
  }
  return dbFailure('works.insert', inserted.error)
}

/** Apaga o trabalho e, se for PDF, o arquivo dele no Storage. */
export async function deleteWorkAction(id: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { data, error } = await ctx.supabase
    .from('works')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('id', parsed.data)
    .select('file_path')
  if (error) return dbFailure('works.delete', error)
  await removeObjects(
    ctx,
    (data ?? []).map((r) => r.file_path).filter((p): p is string => !!p),
  )
  return OK
}
