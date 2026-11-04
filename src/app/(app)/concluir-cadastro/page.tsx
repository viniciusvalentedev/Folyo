import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RequireOnboarded } from '@/components/shell/OnboardingGate'
import { getPersonalData } from '@/lib/data/user'
import { CompleteProfileView } from './CompleteProfileView'

export const metadata: Metadata = { title: 'Concluir cadastro', robots: { index: false, follow: false } }

/**
 * Concluir cadastro: celular, data de nascimento e gênero. Chega-se aqui pelo aviso do sino (ou pelas
 * Configurações). Não é obrigatório para usar a Folyo: a pessoa pode deixar para depois.
 * Quem ainda não fez o primeiro acesso vai para lá antes; quem já concluiu vai para o início.
 */
export default function ConcluirCadastroPage() {
  return (
    <>
      <RequireOnboarded />
      <Suspense fallback={null}>
        <RedirectIfComplete />
      </Suspense>
      <CompleteProfileView />
    </>
  )
}

async function RedirectIfComplete() {
  if (await getPersonalData()) redirect('/inicio')
  return null
}
