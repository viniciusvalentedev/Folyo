import type { Metadata } from 'next'
import { RedirectIfOnboarded } from '@/components/shell/OnboardingGate'
import { OnboardingView } from './OnboardingView'

export const metadata: Metadata = { title: 'Primeiro acesso' }

export default function PrimeiroAcessoPage() {
  return (
    <>
      <RedirectIfOnboarded />
      <OnboardingView />
    </>
  )
}
