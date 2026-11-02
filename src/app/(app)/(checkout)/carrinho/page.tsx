import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PreviousPurchases } from '@/app/(app)/(main)/compras/PurchasesView'
import { getMyOrders } from '@/lib/data/orders'
import { CartView } from './CartView'

export const metadata: Metadata = { title: 'Carrinho' }

/** O carrinho mostra, embaixo, as compras anteriores da própria conta (montadas no servidor, a partir do banco). */
export default function CarrinhoPage() {
  return (
    <CartView
      previous={
        <Suspense fallback={null}>
          <Previous />
        </Suspense>
      }
    />
  )
}

async function Previous() {
  return <PreviousPurchases orders={await getMyOrders()} />
}
