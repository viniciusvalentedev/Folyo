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
    const ticket = await prepareMediaUploadAction({ ext: local.ext, size: local.file.size, replaceId: opts.replace?.id })
    if (!ticket.ok) return ticket
    const mime = local.ext === 'pdf' ? 'application/pdf' : IMAGE_MIME[local.ext]
    const res = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': mime, apikey: ticket.apiKey },
      body: local.file,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!res.ok) return { ok: false, error: res.status === 413 ? 'O arquivo é maior que o limite.' : 'Não foi possível enviar o arquivo. Tente de novo.' }

    const payload = { mediaId: ticket.mediaId, version: ticket.version, ext: local.ext, width: local.width, height: local.height }
    const name = cleanMediaName(local.file.name, local.ext === 'pdf' ? 'documento.pdf' : 'imagem')
    const done = opts.replace ? await confirmReplaceMediaAction(payload) : await confirmMediaUploadAction({ ...payload, name })
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
  } catch {
    return { ok: false, error: OFFLINE }
  }
}
