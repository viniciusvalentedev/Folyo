'use server'

import type { Gender } from '@/lib/personal-data'
import { personalDataInputSchema } from '@/lib/validation'
import { personalFailure } from './personal-shared'
import { actionContext, EXPIRED, INVALID, type ActionResult } from './shared'

/**
 * Cadastro completo: celular, data de nascimento e gênero (tela "Concluir cadastro" e Configurações).
 *
 * 1) valida de novo (zod: celular do Brasil com DDD, data que existe e idade entre 10 e 120 anos, gênero da lista);
 * 2) confere quem está logado; 3) grava pela função save_my_personal_data, que confere tudo de novo e só mexe na
 * linha de quem chama. A tabela fica fora da API: nem o token do aluno chega nela direto.
 */
export async function savePersonalDataAction(input: unknown): Promise<ActionResult & { data?: SavedPersonalData }> {
  const parsed = personalDataInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID.error }
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { phone, birthDate, gender, whatsappNews } = parsed.data
  const { error } = await ctx.supabase.rpc('save_my_personal_data', {
    p_phone: phone,
    p_birth_date: birthDate,
    p_gender: gender,
    p_whatsapp_news: whatsappNews ?? null,
  })
  if (error) return personalFailure('personal.save', error)
  return { ok: true, data: { phone, birthDate, gender } }
}

/** O que foi gravado, já no formato guardado (celular +55..., data AAAA-MM-DD), para a tela atualizar. */
type SavedPersonalData = { phone: string; birthDate: string; gender: Gender }
