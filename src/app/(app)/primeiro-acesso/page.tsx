import type { Metadata } from 'next'
import { OnboardingView } from './OnboardingView'

export const metadata: Metadata = { title: 'Primeiro acesso' }

export default function PrimeiroAcessoPage() {
  return <OnboardingView />
}
