import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AudienceView, type CourseMeta } from '@/components/admin/audience/AudienceView'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { resolvePeriod } from '@/lib/admin/period'
import { getLive, getReport, type Live, type Report } from '@/lib/data/audience'
import { allowed } from '@/lib/data/admin'
import { getFullCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Audiência' }

export default function AdminAudiencePage({ searchParams }: PageProps<'/admin/audiencia'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Audience searchParams={searchParams} />
    </Suspense>
  )
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

async function Audience({ searchParams }: { searchParams: PageProps<'/admin/audiencia'>['searchParams'] }) {
  if (!(await allowed('relatorios'))) return <SectionDenied />
  const sp = await searchParams
  const view = one(sp.vista) === 'historico' ? 'historico' : 'aovivo'
  const period = resolvePeriod({ dias: one(sp.dias), de: one(sp.de), ate: one(sp.ate) })

  const catalog = await getFullCatalog()
  const courses: CourseMeta[] = catalog.courses
    .filter((c) => c.status !== 'rascunho')
    .map((c) => ({
      id: c.id,
      title: c.title,
      lessons: c.modules.filter((m) => !m.archived).flatMap((m) => m.lessons.filter((l) => l.published).map((l) => ({ id: l.id, title: l.title }))),
    }))

  // As duas visões chegam juntas: trocar de aba é instantâneo e o "ao vivo" segue atualizando sozinho.
  let live: Live | null = null
  let report: Report | null = null
  try {
    ;[live, report] = await Promise.all([getLive(), getReport(period.from, period.to)])
  } catch {
    // A tela mostra o aviso de erro de cada parte.
  }
  return <AudienceView view={view} courses={courses} initialLive={live} report={report} period={period} />
}
