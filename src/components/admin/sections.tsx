import { Wordmark } from '@/components/brand/Logo'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'

/** Conta sem papel na equipe abriu /admin. */
export function AdminDenied() {
  return (
    <div className="ad-denied surface-paper">
      <Wordmark height={40} tone="indigo" text="var(--ink)" />
      <EmptyState
        icon="Lock"
        title="Você não tem acesso ao painel administrativo"
        action={<ButtonLink href="/inicio">Voltar para a Folyo</ButtonLink>}
      >
        O painel é liberado para contas com papel de editor, administrador ou proprietário. Peça acesso a um
        administrador.
      </EmptyState>
    </div>
  )
}

/** Papel não dá acesso a esta área do painel. */
export function SectionDenied() {
  return (
    <div className="ad-page">
      <EmptyState
        icon="Lock"
        title="Seu papel não dá acesso a esta seção"
        action={
          <ButtonLink href="/admin" variant="quiet">
            Voltar para a visão geral
          </ButtonLink>
        }
      >
        Peça a um administrador para ajustar suas permissões.
      </EmptyState>
    </div>
  )
}

/** Carregando dados de uma página do painel. */
export function SectionLoading() {
  return (
    <div className="ad-page" role="status" aria-label="Carregando">
      <span className="skel" style={{ height: 34, width: 260 }} />
      <span className="skel" style={{ height: 120 }} />
      <span className="skel" style={{ height: 260 }} />
    </div>
  )
}
