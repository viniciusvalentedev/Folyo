import type { Metadata } from 'next'
import { Suspense } from 'react'
import { ReportsView, type ReportCourse } from '@/components/admin/reports/ReportsView'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { resolvePeriod } from '@/lib/admin/period'
import { allowed } from '@/lib/data/admin'
import { getReport, type Report } from '@/lib/data/audience'
import { getFullCatalog } from '@/lib/data/catalog'

export const metadata: Metadata = { title: 'Relatórios' }

export default function AdminReportsPage({ searchParams }: PageProps<'/admin/relatorios'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  )
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const KINDS = ['crescimento', 'matriculas', 'cursos', 'aulas', 'atividade'] as const

async function Reports({ searchParams }: { searchParams: PageProps<'/admin/relatorios'>['searchParams'] }) {
  if (!(await allowed('relatorios'))) return <SectionDenied />
  const sp = await searchParams
  const asked = one(sp.tipo)
  const kind = KINDS.find((k) => k === asked) ?? 'crescimento'
  const period = resolvePeriod({ dias: one(sp.dias), de: one(sp.de), ate: one(sp.ate) })

  const catalog = await getFullCatalog()
  const courses: ReportCourse[] = catalog.courses
    .filter((c) => c.status !== 'rascunho')
    .map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      lessons: c.modules.filter((m) => !m.archived).flatMap((m) => m.lessons.filter((l) => l.published).map((l) => ({ id: l.id, title: l.title }))),
    }))
  let report: Report | null = null
  try {
    report = await getReport(period.from, period.to)
  } catch {
    // A tela mostra o aviso.
  }
  return <ReportsView report={report} courses={courses} period={period} initialKind={kind} />
}
