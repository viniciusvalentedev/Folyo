import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getMyOrders } from '@/lib/data/orders'
import { PurchasesSkeleton, PurchasesView } from './PurchasesView'

export const metadata: Metadata = { title: 'Minhas compras' }

/** Compras da própria conta: o banco só devolve os pedidos de quem está logado. */
export default function ComprasPage() {
  return (
    <Suspense fallback={<PurchasesSkeleton />}>
      <Purchases />
    </Suspense>
  )
}

async function Purchases() {
  return <PurchasesView orders={await getMyOrders()} />
}
