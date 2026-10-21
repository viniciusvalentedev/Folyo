'use client'

import { useApp } from '@/components/providers/AppState'
import { IconButton } from './Button'
import { Icon } from './Icon'

/** Avisos rápidos no canto da tela ("Salvo nos favoritos." etc.). */
export function Toasts() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={'toast toast-' + t.kind}>
          <span className="toast-dot">
            <Icon name={t.kind === 'err' ? 'CircleAlert' : t.kind === 'info' ? 'Info' : 'Check'} size={15} />
          </span>
          <div className="toast-text">
            {t.title && <b>{t.title}</b>}
            <span>{t.text}</span>
          </div>
          {t.actionLabel && t.onAction && (
            <button
              type="button"
              className="toast-act"
              onClick={() => {
                t.onAction?.()
                dismissToast(t.id)
              }}
            >
              {t.actionLabel}
            </button>
          )}
          <IconButton icon="X" label="Fechar aviso" size={14} onClick={() => dismissToast(t.id)} />
        </div>
      ))}
    </div>
  )
}
