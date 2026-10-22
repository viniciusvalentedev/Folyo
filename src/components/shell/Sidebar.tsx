'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { signOutAction } from '@/app/(auth)/actions'
import { Mark, Wordmark } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/indicators'
import { NAV_GROUPS, isActive } from './nav'

function NavLinks({ compact, path }: { compact?: boolean; path: string | null }) {
  const { s, d } = useApp()
  const badges: Record<string, number | null> = {
    '/projetos': s.projects.filter((p) => p.status !== 'concluido').length || null,
    '/curriculo': d.gaps.length || null,
  }
  return (
    <nav>
      {NAV_GROUPS.map((g, i) => (
        <div className="nav-group" key={i}>
          {g.group && (
            <p className="nav-label">
              <span>{g.group}.</span>
            </p>
          )}
          {g.items.map((item) => {
            const on = path !== null && isActive(path, item.to)
            return (
              <Link
                key={item.to}
                href={item.to}
                className={'nav-item' + (on ? ' on' : '')}
                aria-current={on ? 'page' : undefined}
                title={compact ? item.label : undefined}
              >
                <Icon name={item.icon} size={18} />
                <span className="nav-text">{item.label}</span>
                {badges[item.to] && <i className="nav-badge">{badges[item.to]}</i>}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function ActiveNavLinks({ compact }: { compact?: boolean }) {
  return <NavLinks compact={compact} path={usePathname()} />
}

function SettingsLink({ compact }: { compact?: boolean }) {
  const on = isActive(usePathname(), '/configuracoes')
  return (
    <Link
      href="/configuracoes"
      className={'nav-item' + (on ? ' on' : '')}
      title={compact ? 'Configurações' : undefined}
    >
      <Icon name="Settings" size={18} />
      <span className="nav-text">Configurações</span>
    </Link>
  )
}

/** Link do painel: só aparece para quem é da equipe (o painel e o banco conferem de novo). */
function AdminLink({ compact }: { compact?: boolean }) {
  const { s } = useApp()
  if (s.role === 'aluno') return null
  return (
    <Link href="/admin" className="nav-item nav-admin" title={compact ? 'Painel administrativo' : undefined}>
      <Icon name="ShieldCheck" size={19} />
      <span className="nav-text">Painel administrativo</span>
    </Link>
  )
}

function UserMenu() {
  const { s } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (to: string) => {
    setOpen(false)
    router.push(to)
  }

  return (
    <div className="usermenu" ref={ref}>
      <button
        type="button"
        className="user-chip"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <Avatar name={s.user.name} size={34} />
        <span className="nav-text user-meta">
          <b>{s.user.name}</b>
          <small>{s.user.email}</small>
        </span>
        <Icon name="Ellipsis" size={16} className="nav-text" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <button role="menuitem" type="button" onClick={() => go('/perfil')}>
            <Icon name="User" size={16} />
            Meu perfil
          </button>
          <button role="menuitem" type="button" onClick={() => go('/configuracoes')}>
            <Icon name="Settings" size={16} />
            Configurações
          </button>
          <hr />
          {/* Sair de verdade: a sessão é encerrada no servidor. */}
          <form action={signOutAction}>
            <button role="menuitem" type="submit">
              <Icon name="LogOut" size={16} />
              Sair da conta
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/** Menu lateral fixo (no modo aula fica compacto, só com ícones). */
export function Sidebar({ compact }: { compact?: boolean }) {
  return (
    <aside className={'sidebar' + (compact ? ' compact' : '')} aria-label="Navegação principal">
      <Link href="/inicio" className="brand" aria-label="Folyo, ir para o início">
        <Wordmark height={42} className="brand-full" />
        <Mark size={34} className="brand-compact" title="Folyo" />
      </Link>
      {/* Suspense: em rotas com parâmetros ainda desconhecidos, o item ativo aparece depois. */}
      <Suspense fallback={<NavLinks compact={compact} path={null} />}>
        <ActiveNavLinks compact={compact} />
      </Suspense>
      <div className="sidebar-foot">
        <Suspense fallback={null}>
          <SettingsLink compact={compact} />
        </Suspense>
        <AdminLink compact={compact} />
        <UserMenu />
      </div>
    </aside>
  )
}
