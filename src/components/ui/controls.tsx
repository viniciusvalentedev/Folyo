'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { handleGroupKeys } from '@/lib/a11y'
import { Icon, type IconName } from './Icon'

type Option<T extends string> = T | { value: T; label: ReactNode; icon?: IconName; count?: number }

const optValue = <T extends string>(o: Option<T>): T => (typeof o === 'string' ? o : o.value)

/** Grupo de botões segmentados (escolha única). */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  size,
}: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  label: string
  size?: 'sm'
}) {
  return (
    <div
      className={'seg' + (size ? ' seg-' + size : '')}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => handleGroupKeys(e, '[role="radio"]', { select: true, vertical: true })}
    >
      {options.map((o, i) => {
        const v = optValue(o)
        const obj = typeof o === 'string' ? null : o
        // "Roving tabindex": Tab entra no grupo uma vez só (na opção escolhida); as setas percorrem.
        const stop = options.some((x) => optValue(x) === value) ? value === v : i === 0
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            tabIndex={stop ? 0 : -1}
            className={value === v ? 'on' : ''}
            onClick={() => onChange(v)}
          >
            {obj?.icon && <Icon name={obj.icon} size={15} />}
            {obj ? obj.label : v}
            {obj?.count !== undefined && <i>{obj.count}</i>}
          </button>
        )
      })}
    </div>
  )
}

/** Abas. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: ReactNode; icon?: IconName; badge?: number | string | null }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      className="tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => handleGroupKeys(e, '[role="tab"]', { select: false, vertical: false })}
    >
      {tabs.map((t, i) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          tabIndex={(tabs.some((x) => x.value === value) ? value === t.value : i === 0) ? 0 : -1}
          className={value === t.value ? 'on' : ''}
          onClick={() => onChange(t.value)}
        >
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
          {t.badge ? <i className="tab-badge">{t.badge}</i> : null}
        </button>
      ))}
    </div>
  )
}

/** Interruptor liga/desliga com rótulo. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: ReactNode
  id?: string
}) {
  const auto = useId()
  const fid = id || auto
  return (
    <label className="toggle" htmlFor={fid}>
      <span className="toggle-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input id={fid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-ui" aria-hidden="true" />
    </label>
  )
}

/** Campo de formulário: rótulo + controle + dica ou erro. */
export function Field({
  label,
  hint,
  error,
  children,
  id,
  className = '',
}: {
  label?: ReactNode
  hint?: ReactNode
  error?: string
  children: ReactNode
  id?: string
  className?: string
}) {
  return (
    <div className={'field ' + className + (error ? ' has-error' : '')}>
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {error ? (
        <small className="field-error" id={id ? id + '-erro' : undefined}>
          <Icon name="CircleAlert" size={13} />
          {error}
        </small>
      ) : hint ? (
        <small>{hint}</small>
      ) : null}
    </div>
  )
}

/** Lista de opções (select nativo, acessível). */
export function Select<T extends string>({
  value,
  onChange,
  options,
  id,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: (T | { value: T; label: string })[]
  id?: string
  label?: string
}) {
  return (
    <div className="select">
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {options.map((o) =>
          typeof o === 'string' ? (
            <option key={o} value={o}>
              {o}
            </option>
          ) : (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ),
        )}
      </select>
      <Icon name="ChevronDown" size={16} />
    </div>
  )
}

/** Campo de etiquetas (digite e aperte Enter ou vírgula). */
export function ChipInput({
  values,
  onChange,
  suggestions = [],
  placeholder,
  id,
  maxLength = 60,
  max = 20,
}: {
  values: string[]
  onChange: (v: string[]) => void
  suggestions?: string[]
  placeholder?: string
  id?: string
  maxLength?: number
  /** Máximo de itens (igual ao limite do servidor). */
  max?: number
}) {
  const [text, setText] = useState('')
  const add = (raw: string) => {
    const v = raw.trim().slice(0, maxLength)
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setText('')
      return
    }
    onChange([...values, v])
    setText('')
  }
  const sugg = suggestions
    .filter(
      (s) =>
        !values.some((v) => v.toLowerCase() === s.toLowerCase()) &&
        (!text || s.toLowerCase().includes(text.toLowerCase())),
    )
    .slice(0, 6)
  return (
    <div className="chipinput">
      <div className="chipinput-box">
        {values.map((v) => (
          <span key={v} className="chip">
            {v}
            <button type="button" aria-label={`Remover ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="X" size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          maxLength={maxLength}
          placeholder={values.length ? '' : placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault()
              add(text)
            }
            if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1))
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {sugg.length > 0 && (
        <div className="chipinput-sugg">
          {sugg.map((s) => (
            <button type="button" key={s} onMouseDown={(e) => e.preventDefault()} onClick={() => add(s)}>
              <Icon name="Plus" size={12} />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Número que "conta" até o valor novo quando ele muda. */
export function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value)
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const calm =
      document.documentElement.classList.contains('calm') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    const step = (now: number) => {
      const p = calm ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setShown(Math.round(from + (value - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
      else timer = setTimeout(() => setFlash(false), 500)
    }
    raf = requestAnimationFrame((now) => {
      setFlash(true)
      step(now)
    })
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
    }
  }, [value, duration])
  return <span className={'countup' + (flash ? ' flash' : '')}>{shown}</span>
}
