import type { Metadata } from 'next'
import { checkoutConfig } from '@/lib/payments/mercadopago'
import { PaymentView } from './PaymentView'

export const metadata: Metadata = { title: 'Pagamento' }

/**
 * Pagamento dentro do site (/finalizar/pagamento?pedido=<id>): cartão (com parcelas e confirmação do banco) ou Pix.
 * Esta página NÃO libera nada: o acesso só chega quando o servidor confirma o pagamento no Mercado Pago.
 * O navegador recebe só a chave PÚBLICA do Mercado Pago (feita para isso) e nunca o token de acesso.
 */
export default async function PaymentPage({ searchParams }: { searchParams: Promise<{ pedido?: string | string[] }> }) {
  const { pedido } = await searchParams
  return <PaymentView orderId={typeof pedido === 'string' ? pedido : null} publicKey={checkoutConfig()?.publicKey ?? null} />
}
