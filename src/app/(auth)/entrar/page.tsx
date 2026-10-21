import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthShell } from '../AuthShell'
import { LoginView } from './LoginView'

export const metadata: Metadata = { title: 'Entrar' }

export default function EntrarPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="login-form" />}>
        <LoginView />
      </Suspense>
    </AuthShell>
  )
}
