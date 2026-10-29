import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ConfigForm, type Fact } from '@/components/admin/config/ConfigForm'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog, getMediaLibrary } from '@/lib/data/catalog'
import { getAdminConfig } from '@/lib/data/config'
import { getLaunchPromo } from '@/lib/data/shop'
import { bunnyConfigured } from '@/lib/bunny'
import { formatBytes } from '@/lib/media'

export const metadata: Metadata = { title: 'Configurações' }

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Settings />
    </Suspense>
  )
}

async function Settings() {
  if (!(await allowed('configuracoes'))) return <SectionDenied />
  const [{ config, updatedAt }, catalog, media, launchPromo] = await Promise.all([getAdminConfig(), getFullCatalog(), getMediaLibrary(), getLaunchPromo()])
  const bytes = media.reduce((sum, m) => sum + m.size, 0)
  const facts: Fact[] = [
    ['Banco de dados', 'Supabase (Postgres) com regras de acesso por linha'],
    ['Arquivos', 'Supabase Storage: imagens públicas e PDFs privados'],
    ['Vídeo das aulas', bunnyConfigured() ? 'Bunny Stream conectado' : 'Bunny Stream ainda não configurado: só vídeo por link'],
    ['Cursos', String(catalog.courses.length)],
    ['Categorias', String(catalog.categories.length)],
    ['Arquivos na biblioteca', `${media.length} · ${formatBytes(bytes)}`],
  ]
  return <ConfigForm initial={config} updatedAt={updatedAt} facts={facts} launchPromo={launchPromo} />
}
