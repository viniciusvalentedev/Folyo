import type { Metadata } from 'next'
import { RequireOnboarded } from '@/components/shell/OnboardingGate'
import { PublicView } from './PublicView'

export const metadata: Metadata = { title: 'Pré-visualização do portfólio', robots: { index: false, follow: false } }

/**
 * Pré-visualização do portfólio. Fica atrás do login e mostra só os dados da própria
 * pessoa: o endereço público para compartilhar ainda não existe.
 */
export default function PublicoPage() {
  return (
    <>
      <RequireOnboarded />
      <PublicView />
    </>
  )
}
