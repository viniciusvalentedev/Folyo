import { liveSchema } from '@/lib/data/audience'
import { getSessionUser } from '@/lib/data/user'
import { allow } from '@/lib/security/rate-limit'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Quem está assistindo agora (GET /api/admin/ao-vivo), usado pela tela Audiência para atualizar
 * sozinha. O banco confere o papel (administrador ou acima) em `admin_live`; aqui só se
 * confere o login, limita a frequência e valida a resposta. Nunca fica em cache.
 */

const headers = { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json; charset=utf-8' }
const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers })

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail(401, 'Sua sessão expirou. Entre de novo.')
  if (!allow('live:' + user.id, { max: 40, windowMs: 60_000 })) return fail(429, 'Muitas consultas seguidas.')

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('admin_live')
  if (error) return fail(error.code === 'FA403' ? 403 : 500, error.code === 'FA403' ? 'Seu papel não dá acesso a esta área.' : 'Não foi possível atualizar agora.')
  const parsed = liveSchema.safeParse(data)
  if (!parsed.success) return fail(500, 'Resposta inesperada do banco.')
  return new Response(JSON.stringify(parsed.data), { status: 200, headers })
}
