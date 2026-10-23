'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { signOutAction } from '@/app/(auth)/actions'
import { Mark, Wordmark } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Avatar } from '@/components/ui/indicators'
import { ADMIN_NAV, can, ROLES, type Role } from '@/lib/admin/roles'

const COLLAPSE_KEY = 'folyo-admin-recolhido'

const isOn = (path: string | null, to: string) =>
  path !== null && (to === '/admin' ? path === '/admin' : path === to || path.startsWith(to + '/'))

// Menu recolhido: preferência só deste navegador. Se o armazenamento estiver
// bloqueado (aba anônima, por exemplo), vale só enquanto a página estiver aberta.
let collapsedMemory = false
const collapseListeners = new Set<() => void>()
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return collapsedMemory
  }
}
function useCollapsed(): [boolean, (v: boolean) => void] {
  const collapsed = useSyncExternalStore(
    (cb) => {
      collapseListeners.add(cb)
      return () => collapseListeners.delete(cb)
    },
    readCollapsed,
    () => false,
  )
  return [
    collapsed,
    (v) => {
      collapsedMemory = v
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
      } catch {}
      collapseListeners.forEach((l) => l())
    },
  ]
}

function NavItems({ role, path, collapsed }: { role: Role; path: string | null; collapsed: boolean }) {
  return (
    <nav>
      {ADMIN_NAV.filter((item) => can(role, item.perm)).map((item) => {
        const on = isOn(path, item.to)
        return (
          <Link
            key={item.to}
            href={item.to}
            className={'ad-nav' + (on ? ' on' : '')}
            aria-current={on ? 'page' : undefined}
            title={collapsed ? item.label : undefined}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function ActiveNav(props: { role: Role; collapsed: boolean }) {
  return <NavItems {...props} path={usePathname()} />
}

function Title() {
  const path = usePathname()
  const item = [...ADMIN_NAV].reverse().find((i) => isOn(path, i.to))
  return <h2 className="ad-top-title">{item?.label ?? 'Painel'}</h2>
}

function UserMenu({ role }: { role: Role }) {
  const { s } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="ad-top-rel" ref={ref}>
      <button type="button" className="ad-user" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu">
        <Avatar name={s.user.name} size={32} />
        <span className="ad-user-t">
          <b>{s.user.name}</b>
          <small>{ROLES[role].label}</small>
        </span>
        <Icon name="ChevronDown" size={14} />
      </button>
      {open && (
        <div className="ad-pop ad-user-pop" role="menu">
          <p className="ad-pop-k">{s.accountEmail}</p>
          <Link href="/perfil" role="menuitem" className="ad-pop-link" onClick={() => setOpen(false)}>
            <Icon name="User" size={15} />
            Meu perfil
          </Link>
          <Link href="/inicio" role="menuitem" className="ad-pop-link" onClick={() => setOpen(false)}>
            <Icon name="ExternalLink" size={15} />
            Voltar para a Folyo
          </Link>
          <form action={signOutAction}>
            <button type="submit" role="menuitem">
              <Icon name="LogOut" size={15} />
              Sair da conta
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

/** Moldura do painel: menu lateral escuro + barra do topo + conteúdo em papel claro. */
export function AdminShell({ role, children }: { role: Role; children: ReactNode }) {
  const [collapsed, setCollapsed] = useCollapsed()
  const [drawer, setDrawer] = useState(false)

  return (
    <div className={'ad-app' + (collapsed ? ' collapsed' : '')}>
      <a
        href="#ad-main"
        className="skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('ad-main')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      {drawer && <div className="ad-scrim" onClick={() => setDrawer(false)} />}
      <aside className={'ad-side' + (drawer ? ' open' : '')} aria-label="Navegação do painel" onClick={(e) => {
        // Fecha o menu do celular ao escolher uma página.
        if ((e.target as HTMLElement).closest('a')) setDrawer(false)
      }}>
        <div className="ad-brand">
          <Link href="/admin" className="ad-brand-link" aria-label="Painel da Folyo">
            {collapsed ? <Mark size={30} /> : <Wordmark height={32} />}
          </Link>
          {!collapsed && <span className="ad-brand-tag">Admin</span>}
          <IconButton icon="X" label="Fechar menu" className="ad-side-x" onClick={() => setDrawer(false)} />
        </div>
        <Suspense fallback={<NavItems role={role} path={null} collapsed={collapsed} />}>
          <ActiveNav role={role} collapsed={collapsed} />
        </Suspense>
        <div className="ad-side-foot">
          <Link href="/inicio" className="ad-nav" title={collapsed ? 'Ver a plataforma' : undefined}>
            <Icon name="ExternalLink" size={18} />
            <span>Ver a plataforma</span>
          </Link>
          <button
            type="button"
            className="ad-nav ad-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            aria-expanded={!collapsed}
          >
            <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={18} />
            <span>Recolher menu</span>
          </button>
        </div>
      </aside>
      <div className="ad-main-col">
        <header className="ad-top">
          <IconButton icon="Menu" label="Abrir menu" className="ad-menu-btn" onClick={() => setDrawer(true)} />
          <Suspense fallback={<h2 className="ad-top-title">Painel</h2>}>
            <Title />
          </Suspense>
          <span className="grow" />
          <UserMenu role={role} />
        </header>
        <main id="ad-main" tabIndex={-1} className="ad-main">
          {children}
        </main>
      </div>
    </div>
  )
}
