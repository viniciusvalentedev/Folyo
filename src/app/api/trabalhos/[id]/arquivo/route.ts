import { getSessionUser } from '@/lib/data/user'
import { API_LIMITS, allow } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation'

/**
 * Abre o PDF de um trabalho (GET /api/trabalhos/<id>/arquivo).
 *
 * Só o dono vê: o servidor confere o login, procura o trabalho com as regras do
 * banco (RLS: aluno só enxerga as próprias linhas) e entrega o arquivo do bucket
 * PRIVADO. O endereço do Storage nunca vai para o navegador. A resposta não fica
 * em cache e o tipo é fixo em application/pdf.
 */

const BUCKET = 'student-works'

const notFound = () =>
  new Response('Arquivo não encontrado.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })

export async function GET(request: Request, ctx: RouteContext<'/api/trabalhos/[id]/arquivo'>) {
  const { id } = await ctx.params
  if (!uuidSchema.safeParse(id).success) return notFound()

  const user = await getSessionUser()
  if (!user) return new Response('Faça login para abrir o arquivo.', { status: 401, headers: { 'Cache-Control': 'no-store' } })
  if (!allow('download:' + user.id, API_LIMITS.download)) {
    return new Response('Muitos pedidos seguidos. Espere um minuto e tente de novo.', {
      status: 429,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    })
  }

  const supabase = await createSupabaseServerClient()
  const { data: work } = await supabase
    .from('works')
    .select('file_path, file_name, kind')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!work || work.kind !== 'pdf' || !work.file_path) return notFound()

  const signed = await supabase.storage.from(BUCKET).createSignedUrl(work.file_path, 60)
  if (signed.error || !signed.data) return notFound()

  const upstream = await fetch(signed.data.signedUrl, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body) return notFound()

  // Nome só com letras seguras no cabeçalho (o nome original aparece na tela, não aqui).
  const download = new URL(request.url).searchParams.get('download') === '1'
  const safeName = (work.file_name ?? 'documento.pdf').replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'documento.pdf'
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
      ...(upstream.headers.get('content-length') ? { 'Content-Length': upstream.headers.get('content-length')! } : {}),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
