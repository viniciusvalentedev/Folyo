'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react'
import { DEFAULT_THEME, THEME_BROWSER_COLOR, THEME_STORAGE_KEY, parseTheme, type Theme } from '@/lib/theme'

/*
 * Tema da plataforma (Padrão, Claro ou Escuro).
 *
 * A escolha vive no navegador (localStorage). O estado é lido com useSyncExternalStore: o servidor
 * sempre entrega "padrao" e, na hidratação, o React troca para o valor salvo sem dar erro de
 * diferença entre servidor e navegador. Várias abas abertas acompanham a mudança (evento "storage").
 *
 * O atributo data-theme no <html> só existe dentro da área do aluno: ao sair dela (landing, login)
 * o provider é desmontado e o atributo é removido, então essas telas continuam como sempre foram.
 */

const listeners = new Set<() => void>()
/** Guarda a escolha na memória caso o navegador bloqueie o localStorage (aba anônima, por exemplo). */
let memory: Theme | null = null

function readSaved(): Theme {
  if (memory) return memory
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME
  }
}

function subscribe(notify: () => void) {
  listeners.add(notify)
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY || e.key === null) {
      memory = null
      notify()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', onStorage)
  }
}

function save(theme: Theme) {
  memory = theme
  try {
    if (theme === DEFAULT_THEME) window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Sem localStorage: o tema vale só até fechar a aba.
  }
  listeners.forEach((fn) => fn())
}

/** Liga (ou desliga) o tema no <html> e acerta a cor da barra do navegador no celular. */
function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === DEFAULT_THEME) root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_BROWSER_COLOR[theme])
}

type ThemeApi = { theme: Theme; setTheme: (theme: Theme) => void }

const ThemeContext = createContext<ThemeApi>({ theme: DEFAULT_THEME, setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, readSaved, () => DEFAULT_THEME)

  // useLayoutEffect: o atributo muda antes da pintura, sem piscar.
  useLayoutEffect(() => {
    applyTheme(theme)
    return () => applyTheme(DEFAULT_THEME)
  }, [theme])

  const setTheme = useCallback((next: Theme) => save(parseTheme(next)), [])
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
