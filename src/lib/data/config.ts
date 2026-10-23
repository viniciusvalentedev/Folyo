import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import { cache } from 'react'
import { z } from 'zod'
import { configSchema, DEFAULT_PUBLIC_CONFIG, publicConfigSchema, type AppConfig, type PublicConfig } from '@/lib/app-config'
import { supabaseEnv } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Marca do cache da configuração pública (a ação de salvar usa `updateTag` com este nome). */
export const CONFIG_TAG = 'app-config'

/**
 * Configuração que todo mundo pode ler (nome, frase da entrada, e-mail de suporte, ordenação
 * e selo do plano). Vem de `public_config()` no banco, chamada SEM sessão (chave pública),
 * por isso pode ficar em cache compartilhado: não tem dado de ninguém. Se o banco não
 * responder (ou a migração ainda não foi aplicada), valem os valores de fábrica.
 */
export async function getPublicConfig(): Promise<PublicConfig> {
  'use cache'
  cacheLife('minutes')
  cacheTag(CONFIG_TAG)
  try {
    const { url, key } = supabaseEnv()
    const res = await fetch(`${url}/rest/v1/rpc/public_config`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (!res.ok) return DEFAULT_PUBLIC_CONFIG
    const parsed = publicConfigSchema.safeParse(await res.json())
    return parsed.success ? parsed.data : DEFAULT_PUBLIC_CONFIG
  } catch {
    return DEFAULT_PUBLIC_CONFIG
  }
}

const adminConfigSchema = z.object({ data: configSchema, updatedAt: z.string().max(64).nullable() })
export type AdminConfig = { config: AppConfig; updatedAt: string | null }

/** Configuração completa (administrador ou acima; o banco confere o papel). Lida sem cache. */
export const getAdminConfig = cache(async (): Promise<AdminConfig> => {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('admin_get_config')
  if (error) {
    console.error('Falha no painel', { fn: 'admin_get_config', code: error.code })
    throw new Error('Não foi possível carregar as configurações agora.')
  }
  const parsed = adminConfigSchema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta inesperada do banco', { fn: 'admin_get_config' })
    throw new Error('Não foi possível carregar as configurações agora.')
  }
  return { config: parsed.data.data as AppConfig, updatedAt: parsed.data.updatedAt }
})
