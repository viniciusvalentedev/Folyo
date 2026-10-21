import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'

/** Página não encontrada dentro da área do aluno (ex.: curso que não existe). */
export default function AppNotFound() {
  return (
    <div className="page surface-paper">
      <EmptyState icon="Compass" title="Página não encontrada" action={<ButtonLink href="/inicio">Ir para o início</ButtonLink>}>
        O endereço pode ter mudado.
      </EmptyState>
    </div>
  )
}
