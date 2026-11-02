import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Cliente do Supabase com a chave SECRETA (service_role). SÓ para a rota do webhook de pagamento.
 *
 * Essa chave ignora o RLS, mas as tabelas da Folyo não dão nenhum privilégio ao service_role: tudo o que ele consegue
 * fazer é executar as funções liberadas para ele no banco (hoje, só `apply_payment`). Mesmo assim:
 *  - SUPABASE_SECRET_KEY só em variável de ambiente do servidor (Vercel → Production). Nunca NEXT_PUBLIC_, nunca no
 *    GitHub, nunca em conversa.
 *  - Não importe este arquivo fora de rotas de webhook.
 */
export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY?.trim()
  if (!url || !key) throw new Error('Supabase (chave secreta) não configurado para o webhook.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
}
