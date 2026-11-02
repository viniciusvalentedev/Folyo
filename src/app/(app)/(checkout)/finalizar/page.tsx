import type { Metadata } from 'next'
import { checkoutConfig } from '@/lib/payments/mercadopago'
import { CheckoutView } from './CheckoutView'

export const metadata: Metadata = { title: 'Finalizar' }

export default function FinalizarPage() {
  // A venda é ligada no servidor (PAYMENTS_ENABLED + chaves do Mercado Pago). O navegador só recebe "sim" ou "não".
  return <CheckoutView paymentsEnabled={checkoutConfig() !== null} />
}
