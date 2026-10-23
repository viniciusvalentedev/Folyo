'use client'

import { useState, type KeyboardEvent } from 'react'
import { Art } from '@/components/ui/Art'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import type { Tone } from '@/lib/types'
import { ALT_MAX, clampPct, imageUrl, type ImageRef, type ImageSlot, type MediaItem, SLOT_INFO } from '@/lib/media'
import { MediaPicker } from './MediaPicker'

/**
 * Ajuste de uma imagem do curso: ponto de foco (o que não pode ser cortado), texto alternativo
 * e pré-visualização dos três cortes (card 16:9, miniatura 1:1 e banner 21:9).
 */
export function ImageEditor({
  slot,
  value,
  tone,
  media,
  onClose,
  onSave,
}: {
  slot: ImageSlot
  value: ImageRef | null
  tone: Tone
  media: MediaItem[]
  onClose: () => void
  onSave: (ref: ImageRef) => void
}) {
  const [ref, setRef] = useState<ImageRef | null>(value)
  const [item, setItem] = useState<MediaItem | null>(value ? (media.find((m) => m.id === value.media) ?? null) : null)
  const [picking, setPicking] = useState(!value)
  const url = item ? imageUrl(item.path) : null

  const setFocus = (x: number, y: number) => ref && setRef({ ...ref, x: clampPct(x), y: clampPct(y) })
  const click = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setFocus(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }
  const key = (e: KeyboardEvent) => {
    const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key]
    if (step && ref) {
      e.preventDefault()
      setFocus(ref.x + step[0], ref.y + step[1])
    }
  }
  const crop = (ratio: string) => (url && ref ? <Art tone={tone} ratio={ratio} image={{ url, x: ref.x, y: ref.y, alt: '' }} /> : null)

  return (
    <>
      <Modal
        open={!picking}
        onClose={onClose}
        title={`${SLOT_INFO[slot].label} do curso`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" icon="Images" onClick={() => setPicking(true)}>
              Trocar imagem
            </Button>
            <span className="grow" />
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={!ref} onClick={() => ref && onSave(ref)}>
              Usar esta imagem
            </Button>
          </>
        }
      >
        {ref && item && url ? (
          <div className="ad-cover-ed">
            <div>
              <p className="ad-help">Toque na imagem para marcar o ponto que deve ficar sempre visível (ou use as setas do teclado). Os cortes ao lado se ajustam a ele, sem deformar a imagem.</p>
              <div className="ad-focus" onClick={click} role="button" tabIndex={0} aria-label="Definir ponto de foco" onKeyDown={key}>
                {/* eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage */}
                <img src={url} alt="" />
                <span className="ad-focus-dot" style={{ left: `${ref.x}%`, top: `${ref.y}%` }} />
              </div>
              <p className="ad-meta">
                {item.name}
                {item.width ? ` · ${item.width}×${item.height} px` : ''} · foco em {ref.x}% × {ref.y}%
                {item.width && item.height && item.width / item.height < 1.3 ? ' · imagem estreita: as bordas de cima e de baixo serão cortadas nos cards' : ''}
              </p>
              <Field label="Texto alternativo" id="img-alt" hint="Descreva a imagem para quem usa leitor de tela. Deixe vazio se for só decorativa.">
                <input id="img-alt" className="inp" value={ref.alt} maxLength={ALT_MAX} onChange={(e) => setRef({ ...ref, alt: e.target.value })} />
              </Field>
            </div>
            <div className="ad-crops">
              <figure>
                {crop('16 / 9')}
                <figcaption>Card do catálogo · 16:9</figcaption>
              </figure>
              <figure className="sq">
                {crop('1 / 1')}
                <figcaption>Miniatura · 1:1</figcaption>
              </figure>
              <figure>
                {crop('21 / 9')}
                <figcaption>Banner · 21:9</figcaption>
              </figure>
            </div>
          </div>
        ) : (
          <EmptyState icon="ImageOff" title="Nenhuma imagem escolhida" action={<Button onClick={() => setPicking(true)}>Escolher imagem</Button>} />
        )}
      </Modal>
      <MediaPicker
        open={picking}
        kind="image"
        items={media}
        title={`Escolher imagem · ${SLOT_INFO[slot].label.toLowerCase()}`}
        onClose={() => (ref ? setPicking(false) : onClose())}
        onPick={(m) => {
          setItem(m)
          setRef({ media: m.id, x: 50, y: 50, alt: ref?.alt || m.alt })
          setPicking(false)
        }}
      />
    </>
  )
}
