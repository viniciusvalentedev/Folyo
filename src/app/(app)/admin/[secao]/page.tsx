import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { SectionDenied, SectionLoading } from '@/components/admin/sections'
import { AdminHead, Notice } from '@/components/admin/ui'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'
import { ADMIN_NAV, SOON } from '@/lib/admin/roles'
import { allowed } from '@/lib/data/admin'

/** Áreas do painel que ainda vão ser feitas (cursos, categorias, mídia...). */
export function generateStaticParams() {
  return Object.keys(SOON).map((secao) => ({ secao }))
}

export async function generateMetadata({ params }: PageProps<'/admin/[secao]'>): Promise<Metadata> {
  const { secao } = await params
  return { title: ADMIN_NAV.find((i) => i.to === '/admin/' + secao)?.label ?? 'Painel' }
}

export default function SoonPage({ params }: PageProps<'/admin/[secao]'>) {
  return (
    <Suspense fallback={<SectionLoading />}>
      <Soon params={params} />
    </Suspense>
  )
}

async function Soon({ params }: { params: PageProps<'/admin/[secao]'>['params'] }) {
  const { secao } = await params
  const item = ADMIN_NAV.find((i) => i.to === '/admin/' + secao)
  if (!item || !(secao in SOON)) notFound()
  if (!(await allowed(item.perm))) return <SectionDenied />
  return (
    <div className="ad-page">
      <AdminHead title={item.label} />
      <Notice icon="Construction">Esta área ainda está em construção.</Notice>
      <div className="panel">
        <EmptyState icon="Construction" title="Em breve" action={<ButtonLink href="/admin" variant="quiet">Voltar para a visão geral</ButtonLink>}>
          {SOON[secao]}
        </EmptyState>
      </div>
    </div>
  )
}
