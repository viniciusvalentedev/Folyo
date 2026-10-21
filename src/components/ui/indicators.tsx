import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Barra de progresso linear. */
export function Progress({
  value,
  tone = 'lime',
  size = 'md',
  label,
}: {
  value: number
  tone?: 'lime' | 'blue' | 'magenta'
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`progress progress-${size} tone-${tone}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span style={{ width: `${v}%` }} />
    </div>
  )
}

/** Anel de progresso circular. */
export function Ring({
  value,
  size = 64,
  stroke = 6,
  tone = 'var(--lime)',
  track = 'var(--ring-track)',
  children,
  label,
}: {
  value: number
  size?: number
  stroke?: number
  tone?: string
  track?: string
  children?: ReactNode
  label?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={label || `${Math.round(value)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={tone}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, value) / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-arc"
        />
      </svg>
      {children && <div className="ring-in">{children}</div>}
    </div>
  )
}

const EVIDENCE_LABELS = ['Aprendida', 'Praticada', 'Demonstrada']

/** Medidor de evidência de uma competência (3 segmentos). */
export function EvidenceMeter({ level, compact }: { level: number; compact?: boolean }) {
  return (
    <div
      className={'evm' + (compact ? ' evm-compact' : '')}
      role="img"
      aria-label={level ? `Nível de evidência: ${EVIDENCE_LABELS[level - 1]}` : 'Sem evidência registrada'}
    >
      {[1, 2, 3].map((n) => (
        <span key={n} className={'evm-seg' + (level >= n ? ' on l' + n : '')} />
      ))}
      {!compact && <em>{level ? EVIDENCE_LABELS[level - 1] : 'Declarada'}</em>}
    </div>
  )
}

export type PillTone = 'ok' | 'progress' | 'warn' | 'neutral' | 'blue'

export function Pill({
  tone = 'neutral',
  icon,
  children,
  className = '',
}: {
  tone?: PillTone
  icon?: IconName
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`pill pill-${tone} ${className}`}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  )
}

const STATUS = {
  concluido: { label: 'Concluído', tone: 'ok', icon: 'CircleCheck' },
  andamento: { label: 'Em andamento', tone: 'progress', icon: 'CircleDot' },
  revisao: { label: 'Precisa de revisão', tone: 'warn', icon: 'CircleAlert' },
  iniciado: { label: 'Iniciado', tone: 'progress', icon: 'CircleDot' },
  disponivel: { label: 'Disponível', tone: 'neutral', icon: 'Circle' },
} as const satisfies Record<string, { label: string; tone: PillTone; icon: IconName }>

export type StatusKey = keyof typeof STATUS

/** Pílula de status de curso ou projeto. */
export function StatusPill({ status, children }: { status: StatusKey; children?: ReactNode }) {
  const s = STATUS[status]
  return (
    <Pill tone={s.tone} icon={s.icon}>
      {children ?? s.label}
    </Pill>
  )
}

export function statusLabel(status: StatusKey) {
  return STATUS[status].label
}

/** Etiqueta "Demonstração" para recursos ainda simulados. */
export function DemoTag({ children = 'Demonstração' }: { children?: ReactNode }) {
  return (
    <span className="demo-tag">
      <Icon name="FlaskConical" size={12} />
      {children}
    </span>
  )
}

/** Avatar com as iniciais do nome. */
export function Avatar({ name = '', size = 40, ring }: { name?: string; size?: number; ring?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
  return (
    <span
      className={'avatar' + (ring ? ' avatar-ring' : '')}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-hidden="true"
    >
      {initials}
    </span>
  )
}

/** Estado vazio padrão. */
export function EmptyState({
  icon = 'Sparkles',
  title,
  children,
  action,
}: {
  icon?: IconName
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name={icon} size={22} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
