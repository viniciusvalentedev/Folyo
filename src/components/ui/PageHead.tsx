'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { Icon } from './Icon'

/** Volta para a página anterior; se o usuário chegou direto pelo link, vai para `fallback`. */
export function useBack() {
  const router = useRouter()
  return (fallback: string) => {
    if (window.history.length > 1) router.back()
    else router.push(fallback)
  }
}

/** Cabeçalho padrão das páginas: "sobrancelha", título, texto de apoio e ações. */
export function PageHead({
  eyebrow,
  title,
  lead,
  actions,
  back,
}: {
  eyebrow?: ReactNode
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
  back?: string
}) {
  const goBack = useBack()
  return (
    <header className="pagehead rise">
      {back && (
        <button type="button" className="backlink" onClick={() => goBack(back)}>
          <Icon name="ArrowLeft" size={16} />
          Voltar
        </button>
      )}
      <div className="pagehead-row">
        <div className="pagehead-text">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>{title}</h1>
          {lead && <p className="lead">{lead}</p>}
        </div>
        {actions && <div className="pagehead-actions">{actions}</div>}
      </div>
    </header>
  )
}
