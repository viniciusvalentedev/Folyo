'use client'

import { Art } from '@/components/ui/Art'
import { Field, Seg } from '@/components/ui/controls'
import { TONES, TONE_LABELS } from '@/lib/admin/catalog'
import type { Tone } from '@/lib/types'
import { Notice } from '../../ui'
import type { TabProps } from './types'

export function VisualTab({ draft, set }: Pick<TabProps, 'draft' | 'set'>) {
  return (
    <div className="ad-form">
      <section className="ad-fs">
        <h3>Imagens do curso</h3>
        <Notice icon="Construction">
          O envio de capa, miniatura e banner chega na próxima fase, junto com a biblioteca de mídia. Até lá o curso usa a arte padrão abaixo, que já aparece
          no catálogo, na página do curso e no início dos alunos.
        </Notice>
        <div className="ad-slots">
          <div className="ad-slot">
            <div className="ad-slot-head">
              <b>Capa principal</b>
              <small>16:9 · cards do catálogo</small>
            </div>
            <div className="ad-slot-static">
              <Art tone={draft.tone} glyph={draft.glyph} ratio="16 / 9" big />
            </div>
          </div>
          <div className="ad-slot">
            <div className="ad-slot-head">
              <b>Miniatura</b>
              <small>1:1 · listas e recomendações</small>
            </div>
            <div className="ad-slot-static">
              <Art tone={draft.tone} glyph={draft.glyph} ratio="1 / 1" big />
            </div>
          </div>
          <div className="ad-slot">
            <div className="ad-slot-head">
              <b>Banner</b>
              <small>21:9 · topo da página do curso</small>
            </div>
            <div className="ad-slot-static">
              <Art tone={draft.tone} glyph={draft.glyph} ratio="21 / 9" big />
            </div>
          </div>
        </div>
      </section>
      <section className="ad-fs">
        <h3>Arte padrão</h3>
        <div className="ad-fgrid">
          <Field label="Cor" id="c-tone">
            <Seg<Tone> label="Cor da arte" value={draft.tone} onChange={(tone) => set({ tone })} options={TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} />
          </Field>
          <Field label="Letra ou sigla na arte" id="c-glyph" hint="Até 3 caracteres.">
            <input id="c-glyph" className="inp" maxLength={3} value={draft.glyph} onChange={(e) => set({ glyph: e.target.value })} />
          </Field>
        </div>
      </section>
    </div>
  )
}
