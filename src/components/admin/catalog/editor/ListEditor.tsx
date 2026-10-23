'use client'

import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'

/** Lista de textos curtos que se pode reordenar (objetivos de aprendizagem, etapas do projeto). */
export function ListEditor({
  id,
  values,
  onChange,
  placeholder,
  max = 12,
  maxLength = 160,
}: {
  id: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
  max?: number
  maxLength?: number
}) {
  const [text, setText] = useState('')
  const add = () => {
    const v = text.trim()
    if (!v || values.length >= max) return
    onChange([...values, v.slice(0, maxLength)])
    setText('')
  }
  return (
    <div className="ad-listed">
      <ol>
        {values.map((value, i) => (
          <li key={i}>
            <input
              className="inp inp-sm"
              value={value}
              maxLength={maxLength}
              aria-label={`Item ${i + 1}`}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <IconButton
              icon="ChevronUp"
              label="Subir"
              disabled={i === 0}
              onClick={() => {
                const next = [...values]
                ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                onChange(next)
              }}
            />
            <IconButton icon="X" label="Remover" onClick={() => onChange(values.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ol>
      {values.length < max && (
        <div className="ad-listed-add">
          <input
            id={id}
            className="inp inp-sm"
            value={text}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button size="sm" variant="quiet" icon="Plus" disabled={!text.trim()} onClick={add}>
            Adicionar
          </Button>
        </div>
      )}
    </div>
  )
}
