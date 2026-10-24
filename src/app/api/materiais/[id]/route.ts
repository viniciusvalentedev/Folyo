import { streamPdf, pdfNotFound, pdfTooMany, pdfUnauthorized } from '@/lib/data/pdf-stream'
import { getSessionUser } from '@/lib/data/user'
import { API_LIMITS, allow } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isValidSlug } from '@/lib/validation'

/**
 * Abre o PDF de um material de aula (GET /api/materiais/<id do material>).
 *
 * O servidor confere o login e procura o material com as regras do banco (RLS): aluno só
 * enxerga materiais de aulas publicadas; a equipe, todos. O arquivo vem do bucket PRIVADO.
 */
export async function GET(request: Request, ctx: RouteContext<'/api/materiais/[id]'>) {
  const { id } = await ctx.params
  if (!isValidSlug(id)) return pdfNotFound()
  const user = await getSessionUser()
  if (!user) return pdfUnauthorized()
  if (!allow('download:' + user.id, API_LIMITS.download)) return pdfTooMany()

  const supabase = await createSupabaseServerClient()
  const { data: material } = await supabase.from('lesson_materials').select('media_id').eq('id', id).maybeSingle()
  if (!material?.media_id) return pdfNotFound()
  const { data: file } = await supabase.from('media_files').select('path, name, kind').eq('id', material.media_id).maybeSingle()
  if (!file || file.kind !== 'file') return pdfNotFound()

  return streamPdf(supabase, file.path, file.name, new URL(request.url).searchParams.get('download') === '1')
}
