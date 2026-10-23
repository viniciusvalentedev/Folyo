import type { ReactNode } from 'react'
import { MarkPath } from '@/components/brand/Logo'

/** Aviso "Em breve" para quando ainda não há cursos publicados. */
export function SoonBlock({
  title = 'Seus próximos aprendizados começam aqui.',
  children,
  tone = 'paper',
  compact,
}: {
  title?: string
  children?: ReactNode
  tone?: 'paper' | 'ink'
  compact?: boolean
}) {
  return (
    <section className={'soon-block soon-' + tone + (compact ? ' compact' : '')} aria-label="Cursos em breve">
      <svg className="soon-art" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id={'soon-g-' + tone} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9E23F" />
            <stop offset="1" stopColor="#DD33CF" />
          </linearGradient>
        </defs>
        <MarkPath x={62} y={60} r={50} fill={`url(#soon-g-${tone})`} rotate={-8} />
        <MarkPath x={104} y={102} r={9} fill="#2D24C8" />
      </svg>
      <div className="soon-text">
        <p className="eyebrow">Em breve</p>
        <h2>{title}</h2>
        <p>Em breve, novos cursos para transformar conhecimento em projetos reais.</p>
        {children && <div className="soon-actions">{children}</div>}
      </div>
    </section>
  )
}
