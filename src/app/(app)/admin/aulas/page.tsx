import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LessonsTable, type LessonRow } from '@/components/admin/catalog/LessonsTable'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead } from '@/components/admin/ui'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Módulos e aulas' }

export default function AdminLessonsPage() {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Lessons />
    </Suspense>
  )
}

async function Lessons() {
  if (!(await allowed('conteudo'))) return <SectionDenied />
  const catalog = await getFullCatalog()
  const rows: LessonRow[] = []
  for (const c of catalog.courses) {
    c.modules.forEach((m, mi) =>
      m.lessons.forEach((l, li) =>
        rows.push({
          id: l.id,
          title: l.title,
          courseId: c.id,
          course: c.title,
          courseStatus: c.status,
          module: `${mi + 1}. ${m.title}`,
          moduleArchived: m.archived,
          min: l.min,
          hasVideo: !!l.video,
          materials: l.materials.length,
          published: l.published,
          order: mi * 1000 + li,
        }),
      ),
    )
  }
  return (
    <div className="ad-page">
      <AdminHead
        title="Módulos e aulas"
        lead={`${rows.length} aulas em ${catalog.courses.length} cursos. Para criar, reordenar ou editar vídeo e materiais, abra o curso.`}
      />
      <LessonsTable rows={rows} courses={catalog.courses.map((c) => ({ id: c.id, title: c.title }))} />
    </div>
  )
}
