import { MAX_PDF_BYTES } from '@/lib/validation'

/**
 * Confere o arquivo escolhido ANTES de enviar: extensão, tamanho e o começo do conteúdo
 * ("%PDF-"). É só para dar resposta rápida; o servidor confere tudo de novo depois do envio.
 * Devolve a mensagem do problema, ou null se está tudo certo.
 */
export async function pdfProblem(file: File | null | undefined): Promise<string | null> {
  if (!file) return 'Escolha um arquivo.'
  const looksPdf = /\.pdf$/i.test(file.name || '')
  const typeOk = !file.type || file.type === 'application/pdf'
  if (!looksPdf || !typeOk) return 'Envie um arquivo em PDF.'
  if (file.size > MAX_PDF_BYTES) {
    return `O arquivo tem ${(file.size / 1048576).toFixed(1).replace('.', ',')} MB. O limite é 20 MB.`
  }
  if (file.size < 5) return 'O arquivo está vazio.'
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
    if (String.fromCharCode(...head) !== '%PDF-') return 'Este arquivo não parece ser um PDF válido.'
  } catch {
    // Não deu para ler o começo: o servidor confere depois.
  }
  return null
}

/** 1 048 576 -> "1,0 MB"; 52 000 -> "51 KB". */
export function formatFileSize(bytes: number) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Endereço de um trabalho em PDF (só o dono abre). */
export const pdfUrl = (workId: string, download?: boolean) => `/api/trabalhos/${workId}/arquivo${download ? '?download=1' : ''}`

/** "https://www.site.com/pagina" -> "site.com". */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Chave dos trabalhos que não são de curso nenhum. */
export const EXTERNAL = '__externo'
