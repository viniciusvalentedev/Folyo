import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { AdminDenied } from '@/components/admin/sections'
import { Mark } from '@/components/brand/Logo'
import { allowed } from '@/lib/data/admin'

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
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminLoading />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  )
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const ctx = await allowed('painel')
  if (!ctx) return <AdminDenied />
  return <AdminShell role={ctx.role}>{children}</AdminShell>
}

function AdminLoading() {
  return (
    <div className="boot" role="status" aria-label="Carregando o painel">
      <Mark size={44} />
    </div>
  )
}
