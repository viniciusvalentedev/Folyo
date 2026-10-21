import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isValidSlug } from '@/lib/validation'
import { ProjectFormView } from '../../ProjectFormView'

export const metadata: Metadata = { title: 'Editar projeto' }

export default async function EditarProjetoPage({ params }: PageProps<'/projetos/[id]/editar'>) {
  const { id } = await params
  if (!isValidSlug(id)) notFound()
  return <ProjectFormView id={id} />
}
