import type { Metadata } from 'next'
import { CheckoutView } from './CheckoutView'

export const metadata: Metadata = { title: 'Finalizar' }

export default function FinalizarPage() {
  return <CheckoutView />
}
