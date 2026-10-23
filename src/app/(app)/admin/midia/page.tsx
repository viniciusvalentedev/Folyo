import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MediaLibrary } from '@/components/admin/media/MediaLibrary'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { mediaUsage } from '@/lib/admin/media-usage'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog, getMediaLibrary } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Biblioteca de mídia' }

export default function AdminMediaPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Media />
    </Suspense>
  )
}

async function Media() {
  const ctx = await allowed('conteudo')
  if (!ctx) return <SectionDenied />
  const [catalog, items] = await Promise.all([getFullCatalog(), getMediaLibrary()])
  // O banco só deixa excluir arquivo que nenhum curso, categoria ou material usa.
  return <MediaLibrary items={items} usage={mediaUsage(catalog)} canDelete />
}
