import type { Metadata } from 'next'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'

export const metadata: Metadata = { title: 'Página não encontrada' }

/** Qualquer endereço que não existe cai aqui. */
export default function NotFound() {
  return (
    <div className="page surface-paper" style={{ minHeight: '100vh' }}>
      <EmptyState icon="Compass" title="Página não encontrada" action={<ButtonLink href="/inicio">Ir para o início</ButtonLink>}>
        O endereço pode ter mudado.
      </EmptyState>
    </div>
  )
}
