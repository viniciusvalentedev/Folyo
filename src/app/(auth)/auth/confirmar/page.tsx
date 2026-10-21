import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthShell } from '../../AuthShell'
import { ConfirmView } from './ConfirmView'

export const metadata: Metadata = { title: 'Confirmar', robots: { index: false, follow: false } }

/** Página aberta pelo link do e-mail (confirmar conta ou criar senha nova). */
export default function ConfirmarPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="login-form" />}>
        <ConfirmView />
      </Suspense>
    </AuthShell>
  )
}
