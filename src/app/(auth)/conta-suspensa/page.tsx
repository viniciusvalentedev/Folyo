import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { Icon } from '@/components/ui/Icon'
import { getAccount, requireUser } from '@/lib/data/user'
import { siteConfig } from '@/lib/config'
import { signOutAction } from '../actions'

export const metadata: Metadata = { title: 'Conta suspensa', robots: { index: false, follow: false } }

/** Para onde vai quem teve a conta suspensa pela equipe. */
export default function SuspendedPage() {
  return (
    <Suspense fallback={<div className="suspended-page" />}>
      <Suspended />
    </Suspense>
  )
}

async function Suspended() {
  await requireUser()
  const account = await getAccount()
  if (!account.suspended) redirect('/inicio')
  return (
    <div className="suspended-page">
      <Wordmark height={40} tone="indigo" text="var(--ink)" />
      <span className="empty-mark">
        <Icon name="Lock" size={22} />
      </span>
      <h1>Sua conta está suspensa</h1>
      <p>
        Enquanto a suspensão durar, não é possível usar a Folyo. Seus dados continuam guardados. Se achar que foi um
        engano, fale com a gente pelo {siteConfig.supportEmail}.
      </p>
      <form action={signOutAction}>
        <button type="submit" className="btn btn-quiet btn-md">
          <Icon name="LogOut" size={17} />
          <span>Sair da conta</span>
        </button>
      </form>
    </div>
  )
}
