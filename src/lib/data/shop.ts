import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { ID_PATTERN } from '@/lib/admin/catalog'
import type { AccessRow, Shop } from '@/lib/cart'
import { requireUser } from '@/lib/data/user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Liberações de curso e promoção de lançamento da pessoa logada (só servidor).
 *
 * Só serve para a TELA decidir o que mostrar (selo "Pré-acesso", botão "Adicionar", aviso de
 * lançamento). Quem protege o conteúdo é o banco: sem acesso, ele nem entrega o vídeo.
 * Antes do SQL do cupom de lançamento as funções não existem: aí não há promoção nem liberações
 * (e todo curso é gratuito, como sempre foi).
 */

const accessSchema = z.object({
  staff: z.boolean(),
  items: z.array(
    z.object({
      courseId: z.string().regex(ID_PATTERN),
      source: z.enum(['compra', 'manual', 'cupom']),
      grantedAt: z.string().max(64),
      expiresAt: z.string().max(64).nullable(),
      active: z.boolean(),
    }),
  ),
})
const promoSchema = z.object({ code: z.string(), active: z.boolean() }).nullable()

export const getShop = cache(async (): Promise<Shop> => {
  const user = await requireUser()
  const supabase = await createSupabaseServerClient()
  const [acc, promo] = await Promise.all([supabase.rpc('my_course_access'), supabase.rpc('launch_promo_state')])
  let access: AccessRow[] = []
  let staff = false
  if (acc.error) {
    if (acc.error.code !== 'PGRST202') console.error('Falha ao ler os acessos', { code: acc.error.code })
  } else {
    const parsed = accessSchema.safeParse(acc.data)
    if (parsed.success) {
      access = parsed.data.items
      staff = parsed.data.staff
    }
  }
  let promoActive = false
  if (promo.error) {
    if (promo.error.code !== 'PGRST202') console.error('Falha ao ler a promoção', { code: promo.error.code })
  } else {
    const parsed = promoSchema.safeParse(promo.data)
    promoActive = parsed.success && !!parsed.data?.active
  }
  return { userId: user.id, staff, access, promoActive }
})

/** Painel: a promoção de lançamento está ligada? null = SQL do cupom ainda não rodado. */
export async function getLaunchPromo(): Promise<boolean | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('launch_promo_state')
  if (error) {
    if (error.code !== 'PGRST202') console.error('Falha ao ler a promoção', { code: error.code })
    return null
  }
  const parsed = promoSchema.safeParse(data)
  return parsed.success && parsed.data ? parsed.data.active : null
}

const adminAccessSchema = z.array(accessSchema.shape.items.element)

/**
 * Painel: liberações de curso de um aluno (o banco só responde para administrador ou acima).
 * null = sem permissão ou SQL do cupom ainda não rodado.
 */
export async function getUserCourseAccess(userId: string): Promise<AccessRow[] | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('admin_user_course_access', { p_user: userId })
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== 'FA403') console.error('Falha ao ler os acessos do aluno', { code: error.code })
    return null
  }
  const parsed = adminAccessSchema.safeParse(data)
  return parsed.success ? parsed.data : null
}

/**
 * A pessoa pode assistir a este curso? (o banco responde: gratuito, comprado, liberado ou pré-acesso
 * em dia). Sem o SQL do cupom de lançamento, tudo é gratuito: sim.
 */
export async function hasCourseAccess(courseId: string): Promise<boolean> {
  await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('has_course_access', { p_course_id: courseId })
  if (error) {
    if (error.code === 'PGRST202') return true
    console.error('Falha ao conferir o acesso ao curso', { code: error.code })
    throw new Error('Não foi possível abrir o curso agora.')
  }
  return data === true
}
