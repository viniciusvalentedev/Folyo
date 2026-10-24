'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react'

/**
 * Ajudantes de navegação por teclado (só navegador).
 *
 * - useMenuFocus: menus e popovers (foca o primeiro item, setas, Home/End, Esc devolve o foco).
 * - useFocusTrap: gavetas e janelas (prende o Tab dentro, Esc fecha, devolve o foco).
 * - handleGroupKeys: setas em grupos de botões (abas e escolhas), com "roving tabindex".
 * - RouteFocus: ao trocar de página, leva o foco para o conteúdo (quem usa teclado ou leitor de tela
 *   não fica "preso" no link que clicou, lá no topo).
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

const MENU_ITEMS = '[role="menuitem"]:not(:disabled)'

/** Guarda a função mais recente sem refazer os efeitos a cada renderização. */
function useLatest<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  })
  return ref
}

/**
 * Menu ou popover aberto por um botão. `ref` é o elemento que envolve o botão E o menu.
 * Ao abrir, o foco vai para o primeiro item; ↑ ↓ Home End percorrem os itens; Tab fecha e segue;
 * Esc fecha e devolve o foco ao botão que abriu.
 */
export function useMenuFocus(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
  itemSelector: string = MENU_ITEMS,
) {
  const closeRef = useLatest(close)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(itemSelector) ?? [])]
    items()[0]?.focus({ preventScroll: true })

    const onKey = (e: globalThis.KeyboardEvent) => {
      // Só reage quando o foco está neste menu (não atrapalha campos de texto em outros lugares).
      if (!ref.current?.contains(document.activeElement)) return
      const list = items()
      const at = list.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        opener?.focus({ preventScroll: true })
      } else if (e.key === 'Tab') {
        closeRef.current()
      } else if (list.length && at >= 0) {
        const next =
          e.key === 'ArrowDown' ? (at + 1) % list.length
          : e.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
          : e.key === 'Home' ? 0
          : e.key === 'End' ? list.length - 1
          : -1
        if (next < 0) return
        e.preventDefault()
        list[next].focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, ref, itemSelector, closeRef])
}

/**
 * Gaveta ou janela: ao abrir, o foco entra; Tab e Shift+Tab ficam dentro; Esc fecha;
 * ao fechar, o foco volta para quem abriu. Use o `ref` devolvido no elemento da gaveta.
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null)
  const closeRef = useLatest(onClose)
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const box = ref.current
    const focusables = () => [...(box?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const t = setTimeout(() => (focusables()[0] ?? box)?.focus(), 30)

    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !box) return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open, closeRef])
  return ref
}

/**
 * Setas em um grupo de botões (padrão ARIA de abas e de escolha única).
 * `select`: ao mover o foco, já escolhe a opção (escolha única); sem isso, só move o foco e
 * Enter/Espaço confirmam (abas). `vertical`: ↑ ↓ também valem.
 */
export function handleGroupKeys(
  e: KeyboardEvent<HTMLElement>,
  itemSelector: string,
  { select, vertical }: { select: boolean; vertical: boolean },
) {
  const forward = e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown')
  const back = e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp')
  if (!forward && !back && e.key !== 'Home' && e.key !== 'End') return
  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(itemSelector)]
  const at = items.indexOf(document.activeElement as HTMLElement)
  if (at < 0 || !items.length) return
  e.preventDefault()
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (forward ? 1 : -1) + items.length) % items.length
  items[next].focus()
  if (select) items[next].click()
}

/** Troca de página: leva o foco para o conteúdo principal (id informado). Não faz nada na primeira abertura. */
export function RouteFocus({ target }: { target: string }) {
  const path = usePathname()
  const last = useRef(path)
  useEffect(() => {
    if (last.current === path) return
    last.current = path
    document.getElementById(target)?.focus({ preventScroll: true })
  }, [path, target])
  return null
}
