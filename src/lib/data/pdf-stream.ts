import 'server-only'
import { FILE_BUCKET } from '@/lib/media'
import type { createSupabaseServerClient } from '@/lib/supabase/server'

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export const pdfNotFound = () =>
  new Response('Arquivo não encontrado.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })

export const pdfUnauthorized = () => new Response('Faça login para abrir o arquivo.', { status: 401, headers: { 'Cache-Control': 'no-store' } })

/**
 * Entrega um PDF do bucket PRIVADO `catalog-files`. Quem chama já conferiu, com as regras do
 * banco (RLS), que a pessoa pode ver o arquivo. O endereço do Storage nunca vai para o
 * navegador; o tipo é fixo em application/pdf e a resposta não fica em cache.
 */
export async function streamPdf(supabase: Supabase, path: string, name: string, download: boolean) {
  const signed = await supabase.storage.from(FILE_BUCKET).createSignedUrl(path, 60)
  if (signed.error || !signed.data) return pdfNotFound()
  const upstream = await fetch(signed.data.signedUrl, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body) return pdfNotFound()

  const base = name.replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, '_').slice(0, 110) || 'documento'
  const length = upstream.headers.get('content-length')
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${base}.pdf"`,
      ...(length ? { 'Content-Length': length } : {}),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
