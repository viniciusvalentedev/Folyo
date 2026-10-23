import { confirmMediaUploadAction, confirmReplaceMediaAction, prepareMediaUploadAction } from '@/lib/actions/media'
import {
  cleanMediaName,
  formatBytes,
  IMAGE_MIME,
  isPdfHead,
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_SIDE,
  sniffImage,
  type MediaItem,
} from '@/lib/media'

/**
 * Envio de imagens e PDFs para a biblioteca (roda no navegador).
 *
 * Confere o arquivo ANTES de enviar (tipo pelo conteúdo, tamanho e dimensões) só para dar
 * resposta rápida; o servidor e o banco conferem tudo de novo depois do envio.
 */

export type LocalFile = { file: File; ext: 'png' | 'jpg' | 'webp' | 'pdf'; width: number | null; height: number | null }
export type MediaWant = 'image' | 'file'

const OFFLINE = 'Sem conexão com a internet. Confira a rede e tente de novo.'
const MIN_COVER_SIDE = 320

/**
 * Cada passo do envio tem um prazo. Sem isso, um passo que nunca responde deixa a tela em
 * "Enviando…" para sempre, sem dizer o que houve. Com o prazo, a pessoa vê em qual passo parou.
 */
type Step = 'prepare' | 'send' | 'confirm'
const STEP_LIMIT_MS: Record<Step, number> = { prepare: 20_000, send: 90_000, confirm: 30_000 }
const STEP_TIMEOUT: Record<Step, string> = {
  prepare: 'O servidor não respondeu ao preparar o envio. Tente de novo.',
  send: 'O envio do arquivo demorou demais e foi interrompido. Confira a conexão e tente de novo.',
  confirm: 'O arquivo foi enviado, mas a confirmação demorou demais. Tente de novo.',
}

class StepTimeout extends Error {
  step: Step
  constructor(step: Step) {
    super(step)
    this.step = step
  }
}

function withTimeout<T>(promise: Promise<T>, step: Step): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StepTimeout(step)), STEP_LIMIT_MS[step])
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function dimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

/** Confere o arquivo escolhido. Devolve a mensagem do problema, ou o arquivo pronto para enviar. */
export async function inspectLocalFile(file: File, want: MediaWant): Promise<{ ok: true; local: LocalFile } | { ok: false; error: string }> {
  if (file.size < 5) return { ok: false, error: `${file.name}: o arquivo está vazio.` }
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return { ok: false, error: `${file.name}: não foi possível ler o arquivo.` }
  }
  if (want === 'file') {
    if (!isPdfHead(head)) return { ok: false, error: `${file.name}: envie um arquivo em PDF.` }
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: `${file.name}: o PDF tem ${formatBytes(file.size)}. O limite é 20 MB.` }
    return { ok: true, local: { file, ext: 'pdf', width: null, height: null } }
  }
  const ext = sniffImage(head)
  if (!ext) return { ok: false, error: `${file.name}: use uma imagem PNG, JPG ou WebP.` }
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: `${file.name}: a imagem tem ${formatBytes(file.size)}. O limite é 5 MB.` }
  const dim = await dimensions(file)
  if (!dim) return { ok: false, error: `${file.name}: não foi possível abrir a imagem.` }
  if (dim.width > MAX_IMAGE_SIDE || dim.height > MAX_IMAGE_SIDE) return { ok: false, error: `${file.name}: a imagem passa de ${MAX_IMAGE_SIDE} px de largura ou altura.` }
  if (dim.width < MIN_COVER_SIDE || dim.height < MIN_COVER_SIDE / 2) return { ok: false, error: `${file.name}: imagem muito pequena (mínimo ${MIN_COVER_SIDE}×${MIN_COVER_SIDE / 2} px).` }
  return { ok: true, local: { file, ext, width: dim.width, height: dim.height } }
}

type Sent = { ok: true; item: MediaItem } | { ok: false; error: string }

/**
 * Passos 1 a 3 do envio. Sem `replaceId`, cria um arquivo novo; com ele, troca o conteúdo de um
 * arquivo que já existe (todos os lugares que o usam passam a mostrar o novo).
 */
export async function uploadLocalFile(local: LocalFile, opts: { replace?: MediaItem } = {}): Promise<Sent> {
  try {
    const ticket = await withTimeout(prepareMediaUploadAction({ ext: local.ext, size: local.file.size, replaceId: opts.replace?.id }), 'prepare')
    if (!ticket.ok) return ticket
    const mime = local.ext === 'pdf' ? 'application/pdf' : IMAGE_MIME[local.ext]
    const abort = new AbortController()
    const res = await withTimeout(
      fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': mime, apikey: ticket.apiKey },
        body: local.file,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: abort.signal,
      }),
      'send',
    ).catch((error) => {
      if (error instanceof StepTimeout) abort.abort()
      throw error
    })
    if (!res.ok) return { ok: false, error: res.status === 413 ? 'O arquivo é maior que o limite.' : 'Não foi possível enviar o arquivo. Tente de novo.' }

    const payload = { mediaId: ticket.mediaId, version: ticket.version, ext: local.ext, width: local.width, height: local.height }
    const name = cleanMediaName(local.file.name, local.ext === 'pdf' ? 'documento.pdf' : 'imagem')
    const done = await withTimeout(opts.replace ? confirmReplaceMediaAction(payload) : confirmMediaUploadAction({ ...payload, name }), 'confirm')
    if (!done.ok) return done
    const now = new Date().toISOString()
    return {
      ok: true,
      item: {
        id: ticket.mediaId,
        kind: local.ext === 'pdf' ? 'file' : 'image',
        name: opts.replace?.name ?? name,
        alt: opts.replace?.alt ?? '',
        path: `${ticket.mediaId}/${ticket.version}.${local.ext}`,
        mime,
        size: local.file.size,
        width: local.width,
        height: local.height,
        createdAt: opts.replace?.createdAt ?? now,
        updatedAt: now,
      },
    }
  } catch (error) {
    if (error instanceof StepTimeout) {
      console.error('Envio de mídia parou no passo', error.step)
      return { ok: false, error: STEP_TIMEOUT[error.step] }
    }
    return { ok: false, error: OFFLINE }
  }
}
