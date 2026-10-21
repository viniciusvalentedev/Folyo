import type { Metadata } from 'next'
import { Suspense } from 'react'
import { NewProjectFormView } from '../ProjectFormView'

export const metadata: Metadata = { title: 'Novo projeto' }

export default function NovoProjetoPage() {
  return (
    <Suspense fallback={<div className="page surface-paper project-form" />}>
      <NewProjectFormView />
    </Suspense>
  )
}
