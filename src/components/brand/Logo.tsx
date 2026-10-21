import { useId } from 'react'
import { MARK, WORDMARK } from './logo-paths'

/** Pares de cores do degradê do "f" da marca. */
const GRADIENTS = {
  lime: ['#9DB61E', '#ECFF8E'],
  violet: ['#6A4DFF', '#E234CF'],
  orchid: ['#7C2192', '#F59AEA'],
  indigo: ['#3A2BD8', '#DD33CF'],
  deep: ['#14123F', '#3B2DE6'],
  white: ['#FFFFFF', '#FFFFFF'],
  ink: ['#0B0B12', '#0B0B12'],
} as const

export type LogoTone = keyof typeof GRADIENTS

function useGradient(tone: LogoTone, y1: number, y2: number) {
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [from, to] = GRADIENTS[tone] ?? GRADIENTS.lime
  if (from === to) return { fill: from, defs: null }
  return {
    fill: `url(#${id})`,
    defs: (
      <linearGradient id={id} x1="0" x2="0" y1={y1} y2={y2} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
    ),
  }
}

/** Só o "f" da marca. */
export function Mark({
  size = 28,
  tone = 'lime',
  title,
  className = '',
}: {
  size?: number
  tone?: LogoTone
  title?: string
  className?: string
}) {
  const { fill, defs } = useGradient(tone, 0, MARK.h)
  return (
    <svg
      className={'mark ' + className}
      width={(size * MARK.w) / MARK.h}
      height={size}
      viewBox={`0 0 ${MARK.w} ${MARK.h}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {defs && <defs>{defs}</defs>}
      <path d={MARK.d} fill={fill} fillRule="evenodd" />
    </svg>
  )
}

/** Logotipo completo "folyo". */
export function Wordmark({
  height = 30,
  tone = 'lime',
  text = '#fff',
  title = 'Folyo',
  className = '',
}: {
  height?: number
  tone?: LogoTone
  text?: string
  title?: string
  className?: string
}) {
  const { fill, defs } = useGradient(tone, WORDMARK.fTop, WORDMARK.fBottom)
  return (
    <svg
      className={'wordmark ' + className}
      width={(height * WORDMARK.w) / WORDMARK.h}
      height={height}
      viewBox={`0 0 ${WORDMARK.w} ${WORDMARK.h}`}
      role="img"
      aria-label={title}
    >
      {defs && <defs>{defs}</defs>}
      <path d={WORDMARK.f} fill={fill} fillRule="evenodd" />
      <path d={WORDMARK.rest} fill={text} fillRule="evenodd" />
    </svg>
  )
}

/** O "f" desenhado dentro de outro SVG (usado nas artes e ícones decorativos). */
export function MarkPath({
  x = 12,
  y = 12,
  r = 10,
  fill = 'currentColor',
  rotate = 0,
}: {
  x?: number
  y?: number
  r?: number
  fill?: string
  rotate?: number
}) {
  const scale = (2 * r) / MARK.h
  return (
    <path
      d={MARK.d}
      fill={fill}
      fillRule="evenodd"
      transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale}) translate(${-MARK.w / 2} ${-MARK.h / 2})`}
    />
  )
}
