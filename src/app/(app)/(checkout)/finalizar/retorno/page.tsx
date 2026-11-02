import type { Metadata } from 'next'
import { ReturnView } from './ReturnView'

export const metadata: Metadata = { title: 'Pagamento' }

/**
 * Para onde a página de pagamento leva o aluno quando o pagamento é confirmado (/finalizar/retorno?pedido=<id>).
 * Esta página NÃO libera nada: só pergunta ao servidor o status do pedido (que muda quando o servidor confirma o pagamento).
 */
export default async function ReturnPage({ searchParams }: { searchParams: Promise<{ pedido?: string | string[] }> }) {
  const { pedido } = await searchParams
  return <ReturnView orderId={typeof pedido === 'string' ? pedido : null} />
}
