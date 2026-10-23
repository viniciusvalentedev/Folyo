/**
 * Biblioteca de mídia: formatos, limites e ajudantes (vale no servidor e no navegador).
 *
 * Os mesmos limites existem no banco e no Storage (supabase/migrations/20261025000001_*.sql):
 * imagens PNG/JPG/WebP até 5 MB (bucket público `catalog-images`) e PDFs até 20 MB
 * (bucket privado `catalog-files`). O vídeo das aulas NÃO fica aqui: vai para o Bunny Stream.
 */

export type MediaKind = 'image' | 'file'

export const IMAGE_BUCKET = 'catalog-images'
export const FILE_BUCKET = 'catalog-files'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const MAX_FILE_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_SIDE = 8000

/** Extensões aceitas por tipo de arquivo (a extensão do Storage vem do conteúdo, não do nome). */
export const IMAGE_EXTS = ['png', 'jpg', 'webp'] as const
export type ImageExt = (typeof IMAGE_EXTS)[number]
export const IMAGE_MIME: Record<ImageExt, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
export const IMAGE_ACCEPT = Object.values(IMAGE_MIME).join(',')
export const FILE_ACCEPT = 'application/pdf'

/** Onde uma imagem pode ser usada num curso. */
export const IMAGE_SLOTS = ['cover', 'thumb', 'banner'] as const
export type ImageSlot = (typeof IMAGE_SLOTS)[number]
export const SLOT_INFO: Record<ImageSlot, { label: string; hint: string; ratio: string }> = {
  cover: { label: 'Capa', hint: '16:9 · cards do catálogo', ratio: '16 / 9' },
  thumb: { label: 'Miniatura', hint: '1:1 · listas e recomendações', ratio: '1 / 1' },
  banner: { label: 'Banner', hint: '21:9 · topo da página do curso', ratio: '21 / 9' },
}

/** Imagem escolhida para um curso: qual arquivo, ponto de foco (%) e texto alternativo. */
export type ImageRef = { media: string; x: number; y: number; alt: string }
export type CourseImages = Partial<Record<ImageSlot, ImageRef | null>>

/** Imagem pronta para a tela do aluno (endereço público já montado). */
export type CourseImage = { url: string; x: number; y: number; alt: string }
export type StudentImages = Partial<Record<ImageSlot, CourseImage>>

/** Um arquivo da biblioteca, como o painel enxerga. */
export type MediaItem = {
  id: string
  kind: MediaKind
  name: string
  alt: string
  path: string
  mime: string
  size: number
  width: number | null
  height: number | null
  createdAt: string
  updatedAt: string
}

export const ALT_MAX = 160
export const NAME_MAX = 120

/** Endereço público de uma imagem (o bucket `catalog-images` é público; o nome do arquivo muda a cada troca). */
export function imageUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/${IMAGE_BUCKET}/${path}`
}

/** Endereço de um PDF de material: sempre passa pelo servidor, que confere se a pessoa pode ver. */
export const materialUrl = (materialId: string, download?: boolean) =>
  `/api/materiais/${materialId}${download ? '?download=1' : ''}`

export const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50)

/** Descobre o tipo de imagem pelos primeiros bytes (null = não é PNG, JPG nem WebP). */
export function sniffImage(head: Uint8Array): ImageExt | null {
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpg'
  if (
    head.length >= 12 &&
    String.fromCharCode(...head.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...head.slice(8, 12)) === 'WEBP'
  ) {
    return 'webp'
  }
  return null
}

export const isPdfHead = (head: Uint8Array) => head.length >= 5 && String.fromCharCode(...head.slice(0, 5)) === '%PDF-'

/** Nome para mostrar: sem pastas nem caracteres de controle. */
export function cleanMediaName(raw: string, fallback = 'arquivo') {
  const base = raw.split(/[\\/]/).pop() ?? ''
  const name = base.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim()
  return (name || fallback).slice(-NAME_MAX)
}

export function formatBytes(bytes: number) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Onde cada arquivo da biblioteca é usado (montado a partir do catálogo). */
export type MediaUse = { courseId: string | null; courseTitle: string; where: string; published: boolean; categoryId?: string }
