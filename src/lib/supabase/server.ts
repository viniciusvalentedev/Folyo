import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { authCookieOptions, supabaseEnv } from './config'

/**
 * Cliente do Supabase para usar no servidor (Server Components, Server Actions
 * e Route Handlers). Ele age "como o aluno logado": o banco aplica as regras RLS
 * com base no cookie de sessão. Crie um novo a cada uso (nunca compartilhe).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const { url, key } = supabaseEnv()
  return createServerClient(url, key, {
    cookieOptions: authCookieOptions,
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Server Components não podem gravar cookies. Tudo bem: o proxy.ts
          // renova a sessão antes de cada página.
        }
      },
    },
  })
}
