import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isValidSlug } from '@/lib/validation'
import { ProjectDetailView } from './ProjectDetailView'

export const metadata: Metadata = { title: 'Projeto' }

/** Projetos são de cada aluno: a página é montada na hora, com os dados de quem está logado. */
export default async function ProjetoPage({ params }: PageProps<'/projetos/[id]'>) {
  const { id } = await params
  if (!isValidSlug(id)) notFound()
  return <ProjectDetailView id={id} />
}
