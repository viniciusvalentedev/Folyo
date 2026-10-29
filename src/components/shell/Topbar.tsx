'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { CartButton } from '@/components/cart/CartBits'
import { useApp } from '@/components/providers/AppState'
import { Icon, type IconName } from '@/components/ui/Icon'
import { isListed, normalize } from '@/lib/domain/catalog'
import { catalogSkills } from '@/lib/domain/derive'
import { useMenuFocus } from '@/lib/a11y'
import { formatDayMonth } from '@/lib/format'

/** Fecha um popover ao clicar fora ou apertar Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

type Hit = { kind: string; label: string; to: string; icon: IconName }

/** Busca global (Ctrl K / ⌘K). Hoje busca nos dados carregados; depois, no banco. */
function GlobalSearch() {
  const { d, catalog } = useApp()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
        return
      }
      // "/" também abre a busca, a não ser que a pessoa esteja digitando em algum campo.
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const hits = useMemo<Hit[]>(() => {
    const term = normalize(q.trim())
    if (!term) return []
    const out: Hit[] = []
    catalog.courses.forEach((c) => {
      if (!isListed(c, d.courseStats[c.id]?.started)) return
      if (normalize(c.title + ' ' + c.skills.join(' ')).includes(term))
        out.push({ kind: 'Curso', label: c.title, to: '/cursos/' + c.id, icon: 'BookOpen' })
    })
    d.works.forEach((w) => {
      if (normalize(w.title + ' ' + (w.desc || '')).includes(term))
        out.push({ kind: 'Projeto', label: w.title, to: '/projetos', icon: 'FolderKanban' })
    })
    catalogSkills(catalog).forEach((k) => {
      if (normalize(k.name).includes(term)) out.push({ kind: 'Skill', label: k.name, to: '/objetivos', icon: 'Puzzle' })
    })
    return out.slice(0, 8)
  }, [q, catalog, d.works, d.courseStats])

  const showList = open && !!q.trim()

  const pick = (h: Hit) => {
    setOpen(false)
    setQ('')
    router.push(h.to)
  }

  return (
    <div className="gsearch" ref={box}>
      <Icon name="Search" size={17} />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="gsearch-list"
        aria-activedescendant={showList && hits[sel] ? `gsearch-opt-${sel}` : undefined}
        placeholder="Buscar cursos, projetos e skills"
        value={q}
        maxLength={80}
        aria-label="Buscar na plataforma (atalhos: / ou Ctrl K)"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
          setSel(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((i) => Math.min(hits.length - 1, i + 1))
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((i) => Math.max(0, i - 1))
          }
          if (e.key === 'Enter' && hits[sel]) pick(hits[sel])
          if (e.key === 'Escape') {
            setOpen(false)
            e.currentTarget.blur()
          }
          // Tab segue para o próximo item da página; a lista só fecha.
          if (e.key === 'Tab') setOpen(false)
        }}
      />
      <kbd className="hide-mobile">Ctrl K</kbd>
      {showList && (
        <span className="sr-only" role="status">
          {hits.length ? `${hits.length} resultados. Use as setas para cima e para baixo e Enter para abrir.` : 'Nenhum resultado.'}
        </span>
      )}
      {showList && (
        <div className="gsearch-pop" role="listbox" id="gsearch-list" aria-label="Resultados da busca">
          {hits.length ? (
            hits.map((h, i) => (
              <button
                key={h.kind + h.label}
                id={`gsearch-opt-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={i === sel}
                className={i === sel ? 'on' : ''}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(h)}
              >
                <Icon name={h.icon} size={16} />
                <span>{h.label}</span>
                <em>{h.kind}</em>
              </button>
            ))
          ) : (
            <p className="gsearch-empty">
              Nada encontrado para &quot;{q}&quot;. Tente o nome de uma área, como vendas ou inglês.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Notifications() {
  const { s, a } = useApp()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  useMenuFocus(ref, open, () => setOpen(false), '.notif-pop button:not(:disabled)')
  const unread = s.notifications.filter((n) => !n.read).length
  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Notificações${unread ? `, ${unread} não lidas` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(!open)}
      >
        <Icon name="Bell" size={19} />
        {unread > 0 && <i className="dot" />}
      </button>
      {open && (
        <div className="notif-pop">
          <header>
            <b>Notificações</b>
            {unread > 0 && (
              <button type="button" className="link-btn" onClick={a.markAllRead}>
                Marcar todas como lidas
              </button>
            )}
          </header>
          {s.notifications.length === 0 && <p className="muted pad">Tudo em dia por aqui.</p>}
          {s.notifications.slice(0, 6).map((n) => (
            <button
              key={n.id}
              type="button"
              className={'notif-item' + (n.read ? '' : ' unread')}
              onClick={() => {
                a.markNotification(n.id)
                setOpen(false)
                if (n.to) router.push(n.to)
              }}
            >
              <span>{n.text}</span>
              <small>{formatDayMonth(n.date)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Barra do topo: busca, notificações e (no celular) botão de menu. */
export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="topbar">
      <button type="button" className="icon-btn only-mobile" aria-label="Abrir menu" onClick={onMenu}>
        <Icon name="Menu" size={20} />
      </button>
      <Link href="/inicio" className="brand only-mobile" aria-label="Folyo, ir para o início">
        <Wordmark height={28} />
      </Link>
      <GlobalSearch />
      <div className="topbar-right">
        <CartButton />
        <Notifications />
      </div>
    </header>
  )
}
