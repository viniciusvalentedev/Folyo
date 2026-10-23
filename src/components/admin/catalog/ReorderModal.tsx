'use client'

import { useState, useTransition } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import type { DoneResult } from '@/lib/actions/catalog'
import { Notice } from '../ui'

type Item = { id: string; label: string }

/** Janela "Reordenar": arraste ou use as setas, depois "Salvar ordem". */
export function ReorderModal(props: {
  open: boolean
  onClose: () => void
  items: Item[]
  title: string
  hint?: string
  onSave: (ids: string[]) => Promise<DoneResult>
}) {
  // O conteúdo só existe enquanto a janela está aberta: a lista sempre começa da ordem atual.
  return props.open ? <Inner {...props} /> : null
}

function Inner({ onClose, items, title, hint, onSave }: Parameters<typeof ReorderModal>[0]) {
  const [list, setList] = useState(items)
  const [drag, setDrag] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const move = (from: number, step: number) => {
    const to = from + step
    if (to < 0 || to >= list.length) return
    const next = [...list]
    ;[next[from], next[to]] = [next[to], next[from]]
    setList(next)
  }
  const changed = list.some((item, i) => item.id !== items[i]?.id)

  const save = () =>
    start(async () => {
      setError('')
      const r = await onSave(list.map((i) => i.id))
      if (!r.ok) return setError(r.error)
      onClose()
    })

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!changed || pending} onClick={save}>
            {pending ? 'Salvando…' : 'Salvar ordem'}
          </Button>
        </>
      }
    >
      {hint && <p className="ad-help">{hint}</p>}
      <ol className="ad-order">
        {list.map((item, i) => (
          <li
            key={item.id}
            draggable
            className={drag === i ? 'dragging' : ''}
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => {
              e.preventDefault()
              if (drag === null || drag === i) return
              const next = [...list]
              const [moved] = next.splice(drag, 1)
              next.splice(i, 0, moved)
              setList(next)
              setDrag(i)
            }}
            onDragEnd={() => setDrag(null)}
          >
            <Icon name="GripVertical" size={16} className="ad-grip" />
            <span className="ad-order-n">{i + 1}</span>
            <span className="grow">{item.label}</span>
            <IconButton icon="ChevronUp" label={`Subir ${item.label}`} disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon="ChevronDown" label={`Descer ${item.label}`} disabled={i === list.length - 1} onClick={() => move(i, 1)} />
          </li>
        ))}
      </ol>
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
    </Modal>
  )
}
