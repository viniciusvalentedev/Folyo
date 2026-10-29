import type { Metadata } from 'next'
import { CartView } from './CartView'

export const metadata: Metadata = { title: 'Carrinho' }

export default function CarrinhoPage() {
  return <CartView />
}
