import type { Metadata } from 'next'
import { Suspense } from 'react'
import { CoursesList, type CourseListRow } from '@/components/admin/catalog/CoursesList'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Notice } from '@/components/admin/ui'
import { ButtonLink } from '@/components/ui/Button'
import { courseCounts } from '@/lib/admin/catalog'
import { rankOf } from '@/lib/admin/roles'
import { allowed } from '@/lib/data/admin'
import { getContentStatsOrNull } from '@/lib/data/audience'
import { getFullCatalog, getMediaLibrary } from '@/lib/data/catalog'
import { imageUrl } from '@/lib/media'

export const metadata: Metadata = { title: 'Cursos' }

export default function AdminCoursesPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Courses />
    </Suspense>
  )
}

async function Courses() {
  const ctx = await allowed('conteudo')
  if (!ctx) return <SectionDenied />
  const [catalog, media, stats] = await Promise.all([getFullCatalog(), getMediaLibrary(), getContentStatsOrNull()])
  const files = new Map(media.map((m) => [m.id, m]))
  const statOf = new Map((stats?.courses ?? []).map((s) => [s.id, s]))
  const catName = new Map(catalog.categories.map((c) => [c.id, c.name]))
  const rows: CourseListRow[] = catalog.courses.map((c) => {
    const n = courseCounts(c)
    return {
      id: c.id,
      title: c.title,
      cat: c.cat,
      catName: catName.get(c.cat) ?? 'Sem categoria',
      instructor: c.instructor,
      featured: c.featured,
      status: c.status,
      publishAt: c.publishAt,
      tone: c.tone,
      glyph: c.glyph,
      image: (() => {
        const ref = c.images.thumb ?? c.images.cover
        const file = ref ? files.get(ref.media) : undefined
        return ref && file ? { url: imageUrl(file.path), x: ref.x, y: ref.y, alt: ref.alt } : null
      })(),
      stats: stats ? { enrolled: statOf.get(c.id)?.enrolled ?? 0, views: statOf.get(c.id)?.views ?? 0, live: statOf.get(c.id)?.live ?? 0 } : null,
      order: c.order,
      modules: n.modules,
      lessons: n.lessons,
      published: n.published,
      createdAt: c.createdAt ?? '',
      updatedAt: c.updatedAt ?? '',
    }
  })
  const count = (s: string) => rows.filter((r) => r.status === s).length

  return (
    <div className="ad-page">
      <AdminHead
        title="Cursos"
        lead={`${rows.length} ${rows.length === 1 ? 'curso cadastrado' : 'cursos cadastrados'} · ${count('publicado')} publicados · ${count('rascunho')} rascunhos · ${count('agendado')} agendados · ${count('arquivado')} despublicados`}
        actions={
          <ButtonLink href="/admin/cursos/novo" icon="Plus">
            Novo curso
          </ButtonLink>
        }
      />
      {!catalog.categories.length && (
        <Notice tone="warn" action={<ButtonLink href="/admin/categorias" size="sm" variant="quiet">Criar categoria</ButtonLink>}>
          Ainda não há categorias. Crie pelo menos uma antes de cadastrar cursos.
        </Notice>
      )}
      <CoursesList rows={rows} categories={catalog.categories.map((c) => ({ id: c.id, name: c.name }))} canDelete={rankOf(ctx.role) >= 2} />
    </div>
  )
}
