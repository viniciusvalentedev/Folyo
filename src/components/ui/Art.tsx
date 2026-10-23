import type { CSSProperties, ReactNode } from 'react'
import { MarkPath } from '@/components/brand/Logo'
import type { CourseImage } from '@/lib/media'
import type { Tone } from '@/lib/types'

/** Cores de cada tom de arte (fundo, texto, destaque e marca d'água). */
const TONES: Record<Tone, { bg: string; fg: string; a: string; b: string }> = {
  blue: { bg: 'var(--blue)', fg: '#fff', a: 'var(--lime)', b: 'rgba(255,255,255,.14)' },
  magenta: { bg: 'var(--magenta)', fg: 'var(--ink)', a: 'var(--ink)', b: 'rgba(11,11,18,.13)' },
  ink: { bg: 'var(--ink-3)', fg: '#fff', a: 'var(--magenta)', b: 'rgba(255,255,255,.08)' },
  lime: { bg: 'var(--lime)', fg: 'var(--ink)', a: 'var(--blue)', b: 'rgba(11,11,18,.11)' },
  paper: { bg: 'var(--art-paper)', fg: 'var(--ink)', a: 'var(--magenta)', b: 'rgba(45,36,200,.12)' },
}

/** Variações de posição do "f" gigante, para as capas não ficarem todas iguais. */
const LAYOUTS = [
  { x: 122, y: 46, r: 70, rot: -8 },
  { x: 130, y: 60, r: 84, rot: 6 },
  { x: 116, y: 34, r: 62, rot: -14 },
  { x: 128, y: 70, r: 92, rot: 0 },
  { x: 120, y: 52, r: 76, rot: 12 },
]

/**
 * Arte abstrata das capas (cursos e projetos): fundo colorido, o "f" da marca
 * em marca d'água e, opcionalmente, um "glifo" (ex.: "m", "en", "{").
 */
export function Art({
  tone = 'blue',
  glyph,
  seed = 0,
  ratio = '16 / 10',
  className = '',
  children,
  big,
  style,
  image,
}: {
  tone?: Tone
  glyph?: string
  seed?: number
  ratio?: string
  className?: string
  children?: ReactNode
  big?: boolean
  style?: CSSProperties
  /** Imagem própria (capa do curso). Sem ela, vale a arte padrão. */
  image?: CourseImage
}) {
  const c = TONES[tone] ?? TONES.blue
  const l = LAYOUTS[Math.abs(seed) % LAYOUTS.length]
  return (
    <div className={'art ' + className} style={{ aspectRatio: ratio, background: c.bg, color: c.fg, ...style }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage; o foco (object-position) é escolhido no painel
        <img className="art-img" src={image.url} alt={image.alt} loading="lazy" decoding="async" style={{ objectPosition: `${image.x}% ${image.y}%` }} />
      ) : (
        <>
          <svg className="art-svg" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <MarkPath x={l.x} y={l.y} r={l.r} fill={c.b} rotate={l.rot} />
            <MarkPath x={l.x - l.r * 0.62} y={86} r={7} fill={c.a} rotate={l.rot} />
          </svg>
          {glyph && <span className={'art-glyph' + (big ? ' big' : '')}>{glyph}</span>}
        </>
      )}
      {children}
    </div>
  )
}

/** Pequeno "f" decorativo usado como ícone (ex.: "Você vai produzir"). */
export function Spark({ size = 12, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <MarkPath x={12} y={12} r={11} />
    </svg>
  )
}
