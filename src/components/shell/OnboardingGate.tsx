import { Suspense } from 'react'
import { redirectIfOnboarded, requireOnboarded } from '@/lib/data/user'

/**
 * Portões do primeiro acesso (rodam no servidor).
 * Não protegem dados (isso é papel da camada de dados e do RLS); só garantem
 * que o aluno passe pelo primeiro acesso uma vez, e nunca mais.
 */
export function RequireOnboarded() {
  return (
    <Suspense fallback={null}>
      <OnboardedCheck />
    </Suspense>
  )
}

async function OnboardedCheck() {
  return await requireOnboarded()
}

export function RedirectIfOnboarded() {
  return (
    <Suspense fallback={null}>
      <NotOnboardedCheck />
    </Suspense>
  )
}

async function NotOnboardedCheck() {
  return await redirectIfOnboarded()
}
