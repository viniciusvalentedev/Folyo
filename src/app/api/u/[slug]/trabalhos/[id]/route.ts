import { cleanSlug } from '@/lib/data/public-profile'
import { pdfNotFound, pdfTooMany, streamPdf } from '@/lib/data/pdf-stream'
import { API_LIMITS, allow, clientIp } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/validation'

/**
 * Abre o PDF de um trabalho PÚBLICO (GET /api/u/<endereço>/trabalhos/<id>), sem login.
 *
 * O banco (`get_public_work_file`) só entrega o arquivo se, AO MESMO TEMPO: o perfil está público, o
 * portfólio está público e o trabalho está marcado como "Público". Se a pessoa desligar qualquer um
 * deles, o PDF fecha na hora. O endereço do Storage nunca vai para o navegador; o tipo é sempre
 * application/pdf, com nosniff, e a resposta não fica em cache.
 */

const BUCKET = 'student-works'

export async function GET(request: Request, ctx: RouteContext<'/api/u/[slug]/trabalhos/[id]'>) {
  const { slug: rawSlug, id } = await ctx.params
  const slug = cleanSlug(rawSlug)
  if (!slug || !uuidSchema.safeParse(id).success) return pdfNotFound()

  // Visitante sem login: o limite é por IP (na Vercel; no computador de quem desenvolve não há IP confiável).
  const ip = await clientIp()
  if (ip && !allow('public-pdf:' + ip, API_LIMITS.publicDownload)) return pdfTooMany()

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('get_public_work_file', { p_slug: slug, p_id: id })
  if (error) console.error('Falha ao abrir PDF público', { code: error.code })
  const file = data as { file_path?: unknown; file_name?: unknown } | null
  if (error || !file || typeof file.file_path !== 'string') return pdfNotFound()

  const name = typeof file.file_name === 'string' ? file.file_name : 'documento.pdf'
  const download = new URL(request.url).searchParams.get('download') === '1'
  return streamPdf(supabase, file.file_path, name, download, BUCKET)
}
