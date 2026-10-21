import type { Metadata } from 'next'
import { AuthShell } from '../AuthShell'
import { ForgotPasswordView } from './ForgotPasswordView'

export const metadata: Metadata = { title: 'Esqueci minha senha' }

export default function EsqueciSenhaPage() {
  return (
    <AuthShell>
      <ForgotPasswordView />
    </AuthShell>
  )
}
