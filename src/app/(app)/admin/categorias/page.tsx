import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CategoriesManager } from '@/components/admin/catalog/CategoriesManager'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Categorias' }

export default function AdminCategoriesPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Categories />
    </Suspense>
  )
}

async function Categories() {
  if (!(await allowed('conteudo'))) return <SectionDenied />
  const catalog = await getFullCatalog()
  const usage: Record<string, number> = {}
  const tagCount = new Map<string, number>()
  for (const c of catalog.courses) {
    usage[c.cat] = (usage[c.cat] ?? 0) + 1
    for (const t of c.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  }
  return (
    <CategoriesManager
      categories={catalog.categories}
      usage={usage}
      featured={catalog.courses.filter((c) => c.featured).map((c) => ({ id: c.id, title: c.title }))}
      suggested={catalog.tags}
      tagUsage={[...tagCount].map(([tag, count]) => ({ tag, count }))}
    />
  )
}
