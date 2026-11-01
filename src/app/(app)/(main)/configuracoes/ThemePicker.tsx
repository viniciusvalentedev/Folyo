'use client'

import { useTheme } from '@/components/providers/Theme'
import { Icon } from '@/components/ui/Icon'
import { handleGroupKeys } from '@/lib/a11y'
import { THEME_OPTIONS, type Theme } from '@/lib/theme'

/**
 * Seletor de tema (Configurações › Preferências): três cartões com uma miniatura de como a
 * plataforma fica. É um grupo de opções únicas (radiogroup), usável só com o teclado.
 */
export function ThemePicker({ onChange }: { onChange?: (theme: Theme) => void }) {
  const { theme, setTheme } = useTheme()
  return (
    <div
      className="theme-pick"
      role="radiogroup"
      aria-label="Tema da plataforma"
      onKeyDown={(e) => handleGroupKeys(e, '[role="radio"]', { select: true, vertical: true })}
    >
      {THEME_OPTIONS.map((o) => {
        const on = theme === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            // Tab entra no grupo uma vez só (na opção escolhida); as setas percorrem as outras.
            tabIndex={on ? 0 : -1}
            className={'theme-opt' + (on ? ' on' : '')}
            data-t={o.value}
            onClick={() => {
              if (on) return
              setTheme(o.value)
              onChange?.(o.value)
            }}
          >
            <span className="theme-prev" aria-hidden="true">
              <i className="tp-side" />
              <i className="tp-main">
                <b />
                <b />
              </i>
            </span>
            <span className="theme-opt-t">
              <b>{o.label}</b>
              <small>{o.hint}</small>
            </span>
            {on && <Icon name="Check" size={16} className="theme-check" />}
          </button>
        )
      })}
    </div>
  )
}
