import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getDemoProjectParams } from '@/lib/data/user'
import { isValidSlug } from '@/lib/validation'
import { ProjectFormView } from '../../ProjectFormView'

export const metadata: Metadata = { title: 'Editar projeto' }

export async function generateStaticParams() {
  return getDemoProjectParams()
}

export default async function EditarProjetoPage({ params }: PageProps<'/projetos/[id]/editar'>) {
  const { id } = await params
  if (!isValidSlug(id)) notFound()
  return <ProjectFormView id={id} />
}
