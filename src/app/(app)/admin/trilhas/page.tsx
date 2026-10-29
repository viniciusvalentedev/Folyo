import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { TrailsManager } from '@/components/admin/catalog/TrailsManager'
import { isLive } from '@/lib/domain/catalog-rows'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog, getTrails } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Trilhas' }

export default function AdminTrailsPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Trails />
    </Suspense>
  )
}

async function Trails() {
  if (!(await allowed('conteudo'))) return <SectionDenied />
  const [{ trails, saved }, catalog] = await Promise.all([getTrails(), getFullCatalog()])
  return (
    <TrailsManager
      trails={trails}
      saved={saved}
      courses={catalog.courses.map((c) => ({ id: c.id, title: c.title, skills: c.skills, live: isLive(c) }))}
    />
  )
}
