import 'server-only'
import { requireUser } from '@/lib/data/user'
import { myOrdersSchema, type MyOrder } from '@/lib/payments/order'
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
