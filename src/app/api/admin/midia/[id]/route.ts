import { allowed } from '@/lib/data/admin'
import { pdfNotFound, pdfTooMany, pdfUnauthorized, streamPdf } from '@/lib/data/pdf-stream'
import { getSessionUser } from '@/lib/data/user'
import { API_LIMITS, allow } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation'

/** Abre um PDF da biblioteca de mídia no painel (só quem tem acesso ao conteúdo). */
export async function GET(request: Request, ctx: RouteContext<'/api/admin/midia/[id]'>) {
  const { id } = await ctx.params
  if (!uuidSchema.safeParse(id).success) return pdfNotFound()
  if (!(await allowed('conteudo'))) return pdfUnauthorized()
  const user = await getSessionUser()
  if (user && !allow('download:' + user.id, API_LIMITS.download)) return pdfTooMany()

  const supabase = await createSupabaseServerClient()
  const { data: file } = await supabase.from('media_files').select('path, name, kind').eq('id', id).maybeSingle()
  if (!file || file.kind !== 'file') return pdfNotFound()
  return streamPdf(supabase, file.path, file.name, new URL(request.url).searchParams.get('download') === '1')
}
