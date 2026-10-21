import type { Metadata } from 'next'
import { Suspense } from 'react'
import { requireUser } from '@/lib/data/user'
import { AuthShell } from '../AuthShell'
import { ResetPasswordView } from './ResetPasswordView'

export const metadata: Metadata = { title: 'Nova senha', robots: { index: false, follow: false } }

async function ResetGate() {
  // Só quem está logado (pelo link do e-mail ou pela própria conta) troca a senha.
  const user = await requireUser()
  return <ResetPasswordView email={user.email} />
}

export default function RedefinirSenhaPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="login-form" />}>
        <ResetGate />
      </Suspense>
    </AuthShell>
  )
}
