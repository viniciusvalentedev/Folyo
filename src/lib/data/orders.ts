import 'server-only'
import { requireUser } from '@/lib/data/user'
import { adminOrdersSchema, myOrdersSchema, type AdminOrder, type MyOrder } from '@/lib/payments/order'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Compras da pessoa logada (só servidor), para a página "Minhas compras".
 *
 * Quem decide o que cada pessoa vê é o banco (my_orders só devolve pedidos da própria conta); aqui só se valida o
 * formato. Antes do SQL de compras ser rodado a função não existe: a lista fica vazia, sem erro na tela.
 */
export async function getMyOrders(): Promise<MyOrder[]> {
  await requireUser()
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('my_orders')
  if (error) {
    if (error.code !== 'PGRST202') console.error('Falha ao ler as compras', { code: error.code })
    return []
  }
  const parsed = myOrdersSchema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta inesperada ao ler as compras')
    return []
  }
  return parsed.data
}

/**
 * Painel: as compras (pagas e estornadas) de um aluno. O banco só responde para administrador ou acima, com a verificação
 * em duas etapas. null = sem permissão ou SQL do estorno ainda não rodado (a ficha só não mostra o bloco).
 */
export async function getUserOrders(userId: string): Promise<AdminOrder[] | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.rpc('admin_user_orders', { p_user: userId })
  if (error) {
    if (error.code !== 'PGRST202' && error.code !== 'FA403') console.error('Falha ao ler as compras do aluno', { code: error.code })
    return null
  }
  const parsed = adminOrdersSchema.safeParse(data)
  if (!parsed.success) {
    console.error('Resposta inesperada ao ler as compras do aluno')
    return null
  }
  return parsed.data
}
