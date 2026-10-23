'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { sameText } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { SkillMix } from '@/lib/types'
import { useWidth } from '@/lib/use-width'

type Tone = { edge: string; core: string; ink: string }

/** Cor de cada skill ampla; as outras usam as duas cores de reserva. */
const SKILL_TONES: Record<string, Tone> = {
  Vendas: { edge: '#C9E23F', core: '#93AC14', ink: '#0B0B12' },
  Marketing: { edge: '#DD33CF', core: '#8E1F95', ink: '#FFFFFF' },
  Comunicação: { edge: '#5047E6', core: '#2D24C8', ink: '#FFFFFF' },
  Tecnologia: { edge: '#ABA6FF', core: '#6A61E2', ink: '#0B0B12' },
  Gestão: { edge: '#F07FE6', core: '#C23DB5', ink: '#0B0B12' },
  Design: { edge: '#E2F07E', core: '#B5CC2E', ink: '#0B0B12' },
  Idiomas: { edge: '#E9E8FC', core: '#ABA6FF', ink: '#0B0B12' },
  Carreira: { edge: '#9B3BB0', core: '#5A1470', ink: '#FFFFFF' },
}
const SPARE_TONES: Tone[] = [
  { edge: '#ABA6FF', core: '#2D24C8', ink: '#0B0B12' },
  { edge: '#F07FE6', core: '#DD33CF', ink: '#0B0B12' },
]
const OTHER_TONE: Tone = { edge: '#5E5C73', core: '#3A3950', ink: '#FFFFFF' }
const MAX_BUBBLES = 8

type MixItem = SkillMix['items'][number]
type Bubble = MixItem & { key: string; tone: Tone; other?: boolean; members?: MixItem[] }
type Circle = { x: number; y: number; r: number }

function toneOf(name: string, index: number): Tone {
  const known = Object.keys(SKILL_TONES).find((k) => sameText(k, name))
  return known ? SKILL_TONES[known] : SPARE_TONES[index % SPARE_TONES.length]
}

const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
const lessonsText = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? plural(Math.round(n), 'aula', 'aulas') : `${oneDecimal(n)} aulas`)

/** As skills com mais aulas viram bolhas; as demais entram juntas em "Outras skills". */
function toBubbles(mix: SkillMix): Bubble[] {
  const items = mix.items
  const shown = items.length > MAX_BUBBLES ? MAX_BUBBLES - 1 : items.length
  const bubbles: Bubble[] = items.slice(0, shown).map((item, i) => ({ ...item, key: item.name, tone: toneOf(item.name, i) }))
  if (items.length > shown) {
    const rest = items.slice(shown)
    bubbles.push({
      key: '__outras',
      name: 'Outras skills',
      other: true,
      members: rest,
      tone: OTHER_TONE,
      value: rest.reduce((sum, i) => sum + i.value, 0),
      pct: rest.reduce((sum, i) => sum + i.pct, 0),
      share: rest.reduce((sum, i) => sum + i.share, 0),
      courses: [],
    })
  }
  return bubbles
}

/** Posiciona as bolhas coladinhas (a maior no centro), respeitando a proporção da área. */
function packCircles(values: number[], aspect: number, gap: number): Circle[] {
  const max = Math.max(...values, 1e-6)
  const radii = values.map((v) => Math.max(0.34, Math.sqrt(v / max)))
  const placed: Circle[] = []
  const cost = (x: number, y: number) => Math.hypot(x / Math.sqrt(aspect), y * Math.sqrt(aspect))
  radii.forEach((r, index) => {
    if (!index) {
      placed.push({ x: 0, y: 0, r })
      return
    }
    let best: { x: number; y: number; cost: number } | null = null
    for (const anchor of placed) {
      for (let step = 0; step < 72; step++) {
        const angle = (step / 72) * Math.PI * 2 + index * 0.61
        const dist = anchor.r + r + gap
        const x = anchor.x + Math.cos(angle) * dist
        const y = anchor.y + Math.sin(angle) * dist
        if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + gap - 1e-6)) continue
        const c = cost(x, y)
        if (!best || c < best.cost) best = { x, y, cost: c }
      }
    }
    placed.push({ x: best!.x, y: best!.y, r })
  })
  return placed
}

/** Ajusta o conjunto de bolhas ao tamanho da área. */
function fitCircles(circles: Circle[], width: number, height: number, padding: number, extra: number) {
  const left = Math.min(...circles.map((c) => c.x - c.r))
  const right = Math.max(...circles.map((c) => c.x + c.r))
  const top = Math.min(...circles.map((c) => c.y - c.r))
  const bottom = Math.max(...circles.map((c) => c.y + c.r))
  const scale = Math.min((width - 2 * (padding + extra)) / (right - left), (height - 2 * (padding + extra)) / (bottom - top), (height * 0.36) / circles[0].r)
  const ox = width / 2 - ((left + right) / 2) * scale
  const oy = height / 2 - ((top + bottom) / 2) * scale
  const fitted = circles.map((c) => ({ x: ox + c.x * scale, y: oy + c.y * scale, r: c.r * scale }))
  return { circles: fitted, scale }
}

const calm = () =>
  typeof matchMedia !== 'undefined' && (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm'))

/** Pontinhos decorativos ao fundo (posição relativa). */
const SPECKS: [number, number][] = [
  [0.08, 0.18], [0.22, 0.86], [0.35, 0.07], [0.52, 0.93], [0.66, 0.12], [0.79, 0.78],
  [0.91, 0.3], [0.95, 0.9], [0.04, 0.62], [0.6, 0.55], [0.44, 0.3], [0.72, 0.45],
]

/**
 * Gráfico de bolhas das skills: cada bolha é uma skill e o tamanho mostra quanto das
 * aulas concluídas pertence a ela. As bolhas flutuam só para dar vida (o tamanho não muda).
 */
export function SkillBubbles({ compact }: { compact?: boolean }) {
  const { d } = useApp()
  const router = useRouter()
  const mix = d.skillMix
  const bubbles = useMemo(() => toBubbles(mix), [mix])
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const width = useWidth(stage)
  const narrow = width > 0 && width < 520
  const height = width
    ? Math.round(narrow ? Math.min(width * 1.02, 400) : compact ? Math.max(320, Math.min(width * 0.72, 400)) : Math.max(340, Math.min(width * 0.42, 460)))
    : 0
  // Proporção em quartos: o encaixe das bolhas só refaz quando ela muda de verdade.
  const aspectKey = Math.round((width && height ? width / height : 2) * 4)
  const gap = 0.16
  const layout = useMemo(
    () => packCircles(bubbles.map((b) => b.value), narrow ? 1 : Math.max(0.7, Math.min(aspectKey / 4, 2.4)), gap),
    [bubbles, aspectKey, narrow],
  )
  const extra = narrow ? 12 : 20
  const fitted = useMemo(() => (width && height ? fitCircles(layout, width, height, 14, extra) : { circles: [] as Circle[], scale: 0 }), [layout, width, height, extra])
  const circles = fitted.circles
  const [hover, setHover] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const shown = hover ?? pinned
  const [entered, setEntered] = useState(false)
  const circleRefs = useRef<(SVGCircleElement | null)[]>([])
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const motion = useRef({ t: 0, last: 0, speed: 1, target: 1, visible: false, enter: 0 })
  useEffect(() => {
    motion.current.target = shown !== null ? 0 : 1
  }, [shown])

  useEffect(() => {
    if (!stage) return
    if (calm() || typeof IntersectionObserver === 'undefined') {
      motion.current.visible = true
      const id = requestAnimationFrame(() => setEntered(true))
      return () => cancelAnimationFrame(id)
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((e) => e.isIntersecting)
        motion.current.visible = visible
        if (visible) setEntered(true)
      },
      { threshold: 0.2 },
    )
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stage])

  // Flutuação suave das bolhas (parada quando a aba está escondida ou fora da tela).
  useEffect(() => {
    if (!circles.length) return
    const still = calm()
    const reach = fitted.scale ? gap * fitted.scale : 40
    const amp = circles.map((c) => Math.min(extra, c.r * 0.3 + 4, reach * 0.62 + 3))
    const phase = circles.map((_, i) => [i * 1.7, i * 2.3 + 1, i * 0.9 + 2, i * 1.3 + 3])
    const freq = circles.map((_, i) => [0.055 + (i % 3) * 0.014, 0.035 + (i % 4) * 0.01, 0.048 + (i % 2) * 0.016, 0.03 + (i % 5) * 0.008])
    let raf = 0
    const place = (x: number, y: number, i: number) => {
      circleRefs.current[i]?.setAttribute('cx', x.toFixed(2))
      circleRefs.current[i]?.setAttribute('cy', y.toFixed(2))
      const button = buttonRefs.current[i]
      if (button) button.style.transform = `translate(${(x - circles[i].r).toFixed(2)}px, ${(y - circles[i].r).toFixed(2)}px)`
    }
    const frame = (time: number) => {
      const m = motion.current
      const dt = m.last ? Math.min(0.05, (time - m.last) / 1000) : 0
      m.last = time
      m.speed += (m.target - m.speed) * Math.min(1, dt * (m.target ? 1.5 : 7))
      if (!still) m.t += dt * m.speed
      m.enter = Math.min(1, m.enter + dt / 1.1)
      const eased = 1 - Math.pow(1 - m.enter, 3)
      circles.forEach((c, i) => {
        const dx = still ? 0 : amp[i] * (0.65 * Math.sin(m.t * freq[i][0] * 6.283 + phase[i][0]) + 0.35 * Math.sin(m.t * freq[i][1] * 6.283 + phase[i][1]))
        const dy = still ? 0 : amp[i] * (0.65 * Math.cos(m.t * freq[i][2] * 6.283 + phase[i][2]) + 0.35 * Math.sin(m.t * freq[i][3] * 6.283 + phase[i][3]))
        place(width / 2 + (c.x + dx - width / 2) * (0.55 + 0.45 * eased), height / 2 + (c.y + dy - height / 2) * (0.55 + 0.45 * eased), i)
      })
      if (m.visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
      else {
        m.last = 0
        raf = 0
      }
    }
    const kick = () => {
      if (!raf && motion.current.visible && document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }
    if (still) {
      motion.current.enter = 1
      circles.forEach((c, i) => place(c.x, c.y, i))
      return
    }
    if (entered) kick()
    const timer = setInterval(kick, 400)
    document.addEventListener('visibilitychange', kick)
    return () => {
      cancelAnimationFrame(raf)
      clearInterval(timer)
      document.removeEventListener('visibilitychange', kick)
    }
  }, [circles, fitted.scale, entered, width, height, extra])

  useEffect(() => {
    if (pinned === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinned(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pinned])

  if (!mix.counted) {
    return (
      <div className="sbl-empty">
        <div className="sbl-ghosts" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div>
          <b>Suas skills começam a aparecer com a primeira aula concluída.</b>
          <p className="muted">Cada skill vira uma bolha, e o tamanho mostra quantas aulas você já concluiu nela.</p>
          <button type="button" className="btn btn-quiet-dark btn-sm" onClick={() => router.push('/cursos')}>
            <Icon name="Compass" size={16} />
            <span>Explorar cursos</span>
          </button>
        </div>
      </div>
    )
  }

  const active = shown !== null ? bubbles[shown] : null
  const togglePin = (i: number) => setPinned((p) => (p === i ? null : i))
  const blur = narrow ? 9 : 13

  return (
    <div className={'sbl' + (compact ? ' sbl-compact' : '') + (entered ? ' in' : '') + (active ? ' has-active' : '')}>
      <div
        className="sbl-stage"
        ref={setStage}
        style={{ height: height || 340 }}
        onMouseLeave={() => setHover(null)}
        role="group"
        aria-label={`Skills das ${plural(mix.counted, 'aula concluída', 'aulas concluídas')}. Use Tab para percorrer.`}
      >
        {width > 0 && (
          <svg className="sbl-svg" width={width} height={height} aria-hidden="true">
            <defs>
              <filter id="sbl-goo" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
                <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="b" />
                <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -9" result="g" />
                <feComposite in="SourceGraphic" in2="g" operator="atop" />
              </filter>
              {bubbles.map((b, i) => (
                <radialGradient key={b.key} id={`sbl-g${i}`} cx="50%" cy="56%" r="58%">
                  <stop offset="0" stopColor={b.tone.core} />
                  <stop offset="0.55" stopColor={b.tone.edge} stopOpacity="0.96" />
                  <stop offset="1" stopColor={b.tone.edge} />
                </radialGradient>
              ))}
            </defs>
            {SPECKS.map(([x, y], i) => (
              <circle key={i} cx={x * width} cy={y * height} r={i % 3 ? 1.1 : 1.6} className="sbl-speck" />
            ))}
            <g filter="url(#sbl-goo)" className="sbl-goo">
              {circles.map((c, i) => (
                <circle
                  key={bubbles[i].key}
                  ref={(el) => {
                    circleRefs.current[i] = el
                  }}
                  cx={c.x}
                  cy={c.y}
                  r={c.r}
                  fill={`url(#sbl-g${i})`}
                  className={'sbl-c' + (shown === i ? ' on' : '')}
                />
              ))}
            </g>
          </svg>
        )}
        {circles.map((c, i) => {
          const b = bubbles[i]
          const showName = c.r >= (narrow ? 44 : 54)
          const showPct = c.r >= 22
          return (
            <button
              key={b.key}
              type="button"
              ref={(el) => {
                buttonRefs.current[i] = el
              }}
              className={'sbl-b' + (shown === i ? ' on' : '')}
              aria-pressed={pinned === i}
              style={{ width: c.r * 2, height: c.r * 2, transform: `translate(${c.x - c.r}px, ${c.y - c.r}px)`, color: b.tone.ink, '--d': `${i * 90}ms` } as CSSProperties}
              aria-label={`${b.name}: ${b.pct}% das aulas concluídas, ${lessonsText(b.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => togglePin(i)}
            >
              {showPct && (
                <span className="sbl-label">
                  <b style={{ fontSize: Math.max(14, Math.min(34, c.r * 0.34)) }}>{b.pct}%</b>
                  {showName && <span style={{ fontSize: Math.max(11.5, Math.min(15, c.r * 0.15)) }}>{b.name}</span>}
                  {showName && <small style={{ fontSize: Math.max(10.5, Math.min(12.5, c.r * 0.12)) }}>{lessonsText(b.value)}</small>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="sbl-detail" aria-live="polite">
        {active ? (
          <>
            <i style={{ background: active.tone.edge }} />
            <b>{active.name}</b>
            <span>
              {active.pct}% das aulas concluídas · {lessonsText(active.value)}
            </span>
            {active.other ? (
              <small>{active.members?.map((m) => m.name).join(', ')}</small>
            ) : (
              active.courses.length > 0 && <small>De {active.courses.map((c) => c.title).join(' · ')}</small>
            )}
          </>
        ) : (
          <span className="sbl-hint">Passe o cursor ou toque numa bolha para ver de quais cursos vêm as aulas.</span>
        )}
      </div>

      <ul className="sbl-keys" aria-label="Skills">
        {bubbles.map((b, i) => (
          <li key={b.key}>
            <button
              type="button"
              className={shown === i ? 'on' : ''}
              tabIndex={-1}
              aria-hidden="true"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => togglePin(i)}
            >
              <i style={{ background: b.tone.edge }} />
              {b.name}
              <em>{lessonsText(b.value)}</em>
              <b>{b.pct}%</b>
            </button>
          </li>
        ))}
      </ul>

      <p className="sbl-note">
        <Icon name="Info" size={14} />
        <span>
          O tamanho de cada bolha mostra a parte das suas {plural(mix.counted, 'aula concluída', 'aulas concluídas')} em cada skill. Não é nota nem nível de domínio. As
          bolhas se movem só para dar vida ao gráfico: o tamanho não muda.
          {mix.uncounted ? ` ${plural(mix.uncounted, 'aula', 'aulas')} de cursos sem skill cadastrada não ${mix.uncounted === 1 ? 'entra' : 'entram'}.` : ''}
        </span>
      </p>
    </div>
  )
}
