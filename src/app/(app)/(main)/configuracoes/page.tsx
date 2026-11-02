import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getMyOrders } from '@/lib/data/orders'
import { PurchasesList, PurchasesSkeleton } from '../compras/PurchasesView'
import { parseSection } from './sections'
import { SettingsView } from './SettingsView'

export const metadata: Metadata = { title: 'Configurações' }

/**
 * Configurações. `?secao=compras` abre direto em "Minhas compras" (é o endereço que o carrinho, a tela de pagamento e a
 * antiga /compras usam). Ler a URL é dado de cada visita, então fica dentro do Suspense; enquanto isso a tela já aparece.
 */
export default function ConfiguracoesPage({ searchParams }: PageProps<'/configuracoes'>) {
  return (
    <Suspense fallback={<SettingsView purchases={<PurchasesSkeleton />} />}>
      <Settings searchParams={searchParams} />
    </Suspense>
  )
}

async function Settings({ searchParams }: { searchParams: PageProps<'/configuracoes'>['searchParams'] }) {
  const { secao } = await searchParams
  const initial = parseSection(secao)
  // key: se a pessoa já está em Configurações e clica em "Ver todas as compras", a tela recomeça na seção pedida.
  return (
    <SettingsView
      key={initial}
      initialSection={initial}
      purchases={
        <Suspense fallback={<PurchasesSkeleton />}>
          <Purchases />
        </Suspense>
      }
    />
  )
}

/** Compras da própria conta: o banco só devolve os pedidos de quem está logado. */
async function Purchases() {
  return <PurchasesList orders={await getMyOrders()} />
}
