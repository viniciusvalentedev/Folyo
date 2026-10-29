import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCatalog } from '@/lib/data/catalog'
import { isValidSlug } from '@/lib/validation'
import { BuyView } from './BuyView'

export const metadata: Metadata = { title: 'Comprar curso' }

export default async function ComprarPage({ params }: PageProps<'/comprar/[id]'>) {
  const { id } = await params
  const { courses } = await getCatalog()
  // Id com formato estranho ou curso que esta pessoa não enxerga: 404.
  if (!isValidSlug(id) || !courses.some((c) => c.id === id)) notFound()
  return <BuyView id={id} />
}
