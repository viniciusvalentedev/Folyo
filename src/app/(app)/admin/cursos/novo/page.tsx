import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CourseEditor } from '@/components/admin/catalog/CourseEditor'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Notice } from '@/components/admin/ui'
import { ButtonLink } from '@/components/ui/Button'
import { blankCourse, DEFAULT_SKILLS } from '@/lib/admin/catalog'
import { rankOf } from '@/lib/admin/roles'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Novo curso' }

export default function NewCoursePage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <NewCourse />
    </Suspense>
  )
}

async function NewCourse() {
  const ctx = await allowed('conteudo')
  if (!ctx) return <SectionDenied />
  const catalog = await getFullCatalog()
  if (!catalog.categories.length) {
    return (
      <div className="ad-page">
        <AdminHead title="Novo curso" />
        <Notice tone="warn" action={<ButtonLink href="/admin/categorias" size="sm" variant="quiet">Criar categoria</ButtonLink>}>
          Crie pelo menos uma categoria antes de cadastrar o primeiro curso.
        </Notice>
      </div>
    )
  }
  const nextOrder = catalog.courses.reduce((max, c) => Math.max(max, c.order + 1), 0)
  return (
    <CourseEditor
      key="novo"
      isNew
      initial={blankCourse(nextOrder)}
      initialTab="informacoes"
      canDelete={rankOf(ctx.role) >= 2}
      ctx={{
        categories: catalog.categories,
        others: catalog.courses.map((c) => ({ id: c.id, title: c.title })),
        tags: [...new Set([...catalog.tags, ...catalog.courses.flatMap((c) => c.tags)])],
        skills: [...new Set([...DEFAULT_SKILLS, ...catalog.courses.flatMap((c) => c.skills)])],
      }}
    />
  )
}
