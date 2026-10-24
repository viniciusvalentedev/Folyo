'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useCallback, useState, type MouseEvent, type ReactNode } from 'react'
import { IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { RouteFocus, useFocusTrap } from '@/lib/a11y'
import { MOBILE_NAV, isActive } from './nav'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

function MobileNavLinks({ path }: { path: string | null }) {
  return (
    <>
      {MOBILE_NAV.map((item) => {
        const on = path !== null && isActive(path, item.to)
        return (
          <Link key={item.to} href={item.to} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}

function ActiveMobileNavLinks() {
  return <MobileNavLinks path={usePathname()} />
}

/** Barra de atalhos no rodapé (só aparece no celular). */
function MobileNav({ onMore }: { onMore: () => void }) {
  return (
    <nav className="mobilenav" aria-label="Navegação rápida">
      <Suspense fallback={<MobileNavLinks path={null} />}>
        <ActiveMobileNavLinks />
      </Suspense>
      <button type="button" onClick={onMore}>
        <Icon name="Menu" size={20} />
        <span>Mais</span>
      </button>
    </nav>
  )
}

/** Menu completo em gaveta (celular). Fecha ao escolher um link, com Esc ou clique fora. */
function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Teclado: o foco entra na gaveta, o Tab fica dentro dela, Esc fecha e o foco volta para quem abriu.
  const ref = useFocusTrap(open, onClose)
  if (!open) return null
  const closeOnLink = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a')) onClose()
  }
  return (
    <div className="drawer-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" ref={ref} role="dialog" aria-modal="true" aria-label="Menu" onClick={closeOnLink}>
        <IconButton icon="X" label="Fechar menu" onClick={onClose} className="drawer-x" />
        <Sidebar />
      </div>
    </div>
  )
}

/**
 * Moldura do app logado: menu lateral, topo, conteúdo e navegação do celular.
 * `classroom` = modo aula (menu lateral compacto, sem a barra do topo no computador).
 */
export function AppFrame({ children, classroom }: { children: ReactNode; classroom?: boolean }) {
  const [drawer, setDrawer] = useState(false)
  const close = useCallback(() => setDrawer(false), [])
  const openDrawer = useCallback(() => setDrawer(true), [])
  return (
    <div className={'app' + (classroom ? ' in-class' : '')}>
      <a
        href="#main"
        className="skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('main')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      <Sidebar compact={classroom} />
      <div className="app-main">
        {classroom ? (
          <div className="class-mobile-top only-mobile">
            <Topbar onMenu={openDrawer} />
          </div>
        ) : (
          <Topbar onMenu={openDrawer} />
        )}
        <main id="main" tabIndex={-1}>
          {children}
        </main>
      </div>
      <MobileNav onMore={openDrawer} />
      <Drawer open={drawer} onClose={close} />
      <Suspense fallback={null}>
        <RouteFocus target="main" />
      </Suspense>
    </div>
  )
}
