'use client'

import { useState } from 'react'
import { Art } from '@/components/ui/Art'
import { Button } from '@/components/ui/Button'
import { Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { TONES, TONE_LABELS } from '@/lib/admin/catalog'
import { IMAGE_SLOTS, imageUrl, SLOT_INFO, type ImageRef, type ImageSlot, type MediaItem } from '@/lib/media'
import type { Tone } from '@/lib/types'
import { ImageEditor } from '../../media/ImageEditor'
import type { TabProps } from './types'

const SLOT_TITLES: Record<ImageSlot, string> = { cover: 'Capa principal', thumb: 'Miniatura', banner: 'Banner' }

export function VisualTab({ draft, set, media }: Pick<TabProps, 'draft' | 'set'> & { media: MediaItem[] }) {
  const [editing, setEditing] = useState<ImageSlot | null>(null)
  const setSlot = (slot: ImageSlot, ref: ImageRef | null) => set({ images: { ...draft.images, [slot]: ref } })

  return (
    <div className="ad-form">
      <section className="ad-fs">
        <h3>Imagens do curso</h3>
        <p className="ad-help">
          A capa aparece nos cards do catálogo, na página do curso e no início dos alunos. Miniatura e banner são opcionais: sem eles, a capa é usada com o recorte
          adequado. Proporção recomendada da capa: 16:9 (1600×900 px).
        </p>
        <div className="ad-slots">
          {IMAGE_SLOTS.map((slot) => {
            const ref = draft.images[slot] ?? null
            const file = ref ? media.find((m) => m.id === ref.media) : undefined
            const image = ref && file ? { url: imageUrl(file.path), x: ref.x, y: ref.y, alt: ref.alt } : undefined
            return (
              <div className="ad-slot" key={slot}>
                <div className="ad-slot-head">
                  <b>{SLOT_TITLES[slot]}</b>
                  <small>{SLOT_INFO[slot].hint}</small>
                </div>
                <button type="button" className="ad-slot-img" onClick={() => setEditing(slot)} aria-label={`${ref ? 'Trocar' : 'Escolher'} ${SLOT_TITLES[slot].toLowerCase()}`}>
                  <Art tone={draft.tone} glyph={draft.glyph} ratio={SLOT_INFO[slot].ratio} image={image} big />
                  <span className="ad-slot-over">
                    <Icon name={ref ? 'Crop' : 'Upload'} size={18} />
                    {ref ? 'Trocar ou ajustar' : 'Escolher imagem'}
                  </span>
                </button>
                {ref && (
                  <Button variant="ghost" size="sm" icon="X" onClick={() => setSlot(slot, null)}>
                    Remover e usar a arte padrão
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </section>
      <section className="ad-fs">
        <h3>Arte padrão (quando não há imagem)</h3>
        <div className="ad-fgrid">
          <Field label="Cor" id="c-tone">
            <Seg<Tone> label="Cor da arte" value={draft.tone} onChange={(tone) => set({ tone })} options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} />
          </Field>
          <Field label="Letra ou sigla na arte" id="c-glyph" hint="Até 3 caracteres.">
            <input id="c-glyph" className="inp" maxLength={3} value={draft.glyph} onChange={(e) => set({ glyph: e.target.value })} />
          </Field>
        </div>
      </section>
      {editing && (
        <ImageEditor
          key={editing}
          slot={editing}
          value={draft.images[editing] ?? null}
          tone={draft.tone}
          media={media}
          onClose={() => setEditing(null)}
          onSave={(ref) => {
            setSlot(editing, ref)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
