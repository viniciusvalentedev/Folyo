import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { supabaseEnv } from '@/lib/supabase/config'

const URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL'
const KEY_KEY = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
const saved = { url: process.env[URL_KEY], key: process.env[KEY_KEY] }

const jwt = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`

beforeEach(() => {
  process.env[URL_KEY] = 'https://projeto.supabase.co'
})
afterEach(() => {
  if (saved.url === undefined) delete process.env[URL_KEY]
  else process.env[URL_KEY] = saved.url
  if (saved.key === undefined) delete process.env[KEY_KEY]
  else process.env[KEY_KEY] = saved.key
})

describe('configuração do Supabase (trava da chave secreta)', () => {
  it('aceita a publishable key', () => {
    process.env[KEY_KEY] = 'sb_publishable_abc123'
    expect(supabaseEnv()).toEqual({ url: 'https://projeto.supabase.co', key: 'sb_publishable_abc123' })
  })

  it('recusa a secret key nova (sb_secret_...)', () => {
    process.env[KEY_KEY] = 'sb_secret_abc123'
    expect(() => supabaseEnv()).toThrow(/SECRETA/)
  })

  it('recusa a chave antiga service_role (JWT)', () => {
    process.env[KEY_KEY] = jwt({ role: 'service_role' })
    expect(() => supabaseEnv()).toThrow(/SECRETA/)
  })

  it('aceita a chave antiga anon (JWT)', () => {
    process.env[KEY_KEY] = jwt({ role: 'anon' })
    expect(() => supabaseEnv()).not.toThrow()
  })

  it('avisa quando falta configurar', () => {
    delete process.env[KEY_KEY]
    expect(() => supabaseEnv()).toThrow(/Supabase não configurado/)
    process.env[KEY_KEY] = 'sb_publishable_abc123'
    delete process.env[URL_KEY]
    expect(() => supabaseEnv()).toThrow(/Supabase não configurado/)
  })
})
