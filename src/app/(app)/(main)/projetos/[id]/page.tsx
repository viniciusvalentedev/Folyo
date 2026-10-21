import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemoProjectParams } from '@/lib/data/user'
import { isValidSlug } from '@/lib/validation'
import { ProjectDetailView } from './ProjectDetailView'

export const metadata: Metadata = { title: 'Projeto' }

/**
 * Gera no build as páginas dos projetos da conta de demonstração.
 * Projetos criados depois são renderizados na hora (os dados ficam no navegador).
 */
export async function generateStaticParams() {
  return getDemoProjectParams()
}

export default async function ProjetoPage({ params }: PageProps<'/projetos/[id]'>) {
  const { id } = await params
  if (!isValidSlug(id)) notFound()
  return <ProjectDetailView id={id} />
}
