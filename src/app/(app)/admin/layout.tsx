import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminDenied } from '@/components/admin/sections'
import { Mark } from '@/components/brand/Logo'
import { adminAccess } from '@/lib/data/admin'

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s · Painel Folyo' },
  robots: { index: false, follow: false },
}

/**
 * Painel administrativo.
 *
 * O layout só escolhe a moldura (painel ou "sem acesso"). Cada página confere o
 * papel de novo (layouts não protegem páginas no Next), e o banco confere outra
 * vez em cada função admin_*. Três checagens; a que vale de verdade é a do banco.
 *
 * A equipe também precisa da verificação em duas etapas: sem o código do aplicativo
 * autenticador nesta sessão, quem tem papel é levado para /seguranca/mfa.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const access = await adminAccess()
  if (access.status === 'mfa') redirect('/seguranca/mfa?next=%2Fadmin')
  if (access.status === 'denied') return <AdminDenied />
  return <AdminShell role={access.ctx.role}>{children}</AdminShell>
}

function AdminLoading() {
  return (
    <div className="boot" role="status" aria-label="Carregando o painel">
      <Mark size={44} />
    </div>
  )
}
