import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { safeNext } from '@/lib/auth/redirects'
import { getAal, getTotpFactors } from '@/lib/data/mfa'
import { getAccount, requireUser } from '@/lib/data/user'
import { AuthShell } from '../../AuthShell'
import { MfaView } from './MfaView'

export const metadata: Metadata = { title: 'Verificação em duas etapas', robots: { index: false, follow: false } }

async function MfaGate({ searchParams }: { searchParams: PageProps<'/seguranca/mfa'>['searchParams'] }) {
  const user = await requireUser()
  const account = await getAccount()
  if (account.suspended) redirect('/conta-suspensa')
  // A verificação em duas etapas é da equipe do painel.
  if (account.role === 'aluno') redirect('/inicio')

  const sp = await searchParams
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next, '/admin')
  // Já passou pelo código nesta sessão: segue para onde ia.
  if ((await getAal()) === 'aal2') redirect(next)

  const factors = await getTotpFactors()
  return <MfaView email={user.email} next={next} factorId={factors.verified[0]?.id ?? null} />
}

export default function MfaPage({ searchParams }: PageProps<'/seguranca/mfa'>) {
  return (
    <AuthShell>
      <Suspense fallback={<div className="login-form" />}>
        <MfaGate searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  )
}
