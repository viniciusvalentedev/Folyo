'use client'

import { useRouter } from 'next/navigation'
import { useId, useMemo, useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { FILE_ACCEPT, formatBytes, IMAGE_ACCEPT, type MediaItem, type MediaKind } from '@/lib/media'
import { inspectLocalFile, uploadLocalFile } from '@/lib/media-upload'
import { Notice } from '../ui'
import { MediaThumb } from './MediaThumb'

/**
 * Janela "Escolher imagem / arquivo": envia um arquivo novo ou escolhe da biblioteca.
 * Um arquivo enviado aqui já entra na biblioteca (e pode ser reaproveitado em outros cursos).
 */
export function MediaPicker({
  open,
  onClose,
  onPick,
  kind,
  items,
  title,
}: {
  open: boolean
  onClose: () => void
  onPick: (item: MediaItem) => void
  kind: MediaKind
  items: MediaItem[]
  title?: string
}) {
  const router = useRouter()
  const { toast } = useApp()
  const [extra, setExtra] = useState<MediaItem[]>([])
  const [tab, setTab] = useState<'biblioteca' | 'enviar'>(items.some((i) => i.kind === kind) ? 'biblioteca' : 'enviar')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const inputId = useId()

  const all = useMemo(() => {
    const ids = new Set(items.map((i) => i.id))
    return [...extra.filter((e) => !ids.has(e.id)), ...items].filter((i) => i.kind === kind)
  }, [items, extra, kind])
  const shown = all.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()))

  const send = async (file: File) => {
    setBusy(true)
    setError('')
    const checked = await inspectLocalFile(file, kind)
    if (!checked.ok) {
      setBusy(false)
      return setError(checked.error)
    }
    const sent = await uploadLocalFile(checked.local)
    setBusy(false)
    if (!sent.ok) return setError(sent.error)
    setExtra((e) => [sent.item, ...e])
    toast('Arquivo enviado para a biblioteca.', 'ok')
    router.refresh()
    onPick(sent.item)
  }

  return (
    <Modal open={open} onClose={onClose} title={title ?? (kind === 'image' ? 'Escolher imagem' : 'Escolher arquivo (PDF)')} size="lg" footer={<Button variant="ghost" onClick={onClose}>Cancelar</Button>}>
      <Seg
        label="Origem"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'biblioteca', label: `Biblioteca (${all.length})`, icon: 'Images' },
          { value: 'enviar', label: 'Enviar do dispositivo', icon: 'Upload' },
        ]}
      />
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
      {tab === 'enviar' ? (
        <label
          htmlFor={inputId}
          className={'ad-drop' + (drag ? ' drag' : '') + (busy ? ' busy' : '')}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            const f = e.dataTransfer.files[0]
            if (f) void send(f)
          }}
        >
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept={kind === 'image' ? IMAGE_ACCEPT : FILE_ACCEPT}
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void send(f)
            }}
          />
          <Icon name={busy ? 'RefreshCw' : 'Upload'} size={26} className={busy ? 'spin' : ''} />
          <b>{busy ? 'Enviando…' : 'Arraste um arquivo ou toque para escolher'}</b>
          <small>{kind === 'image' ? 'PNG, JPG ou WebP até 5 MB. Para capas, prefira 1600×900 px (16:9).' : 'PDF até 20 MB.'}</small>
        </label>
      ) : (
        <div className="ad-lib">
          <input className="inp" placeholder="Buscar pelo nome do arquivo" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar na biblioteca" />
          {shown.length ? (
            <ul className="ad-lib-grid">
              {shown.map((m) => (
                <li key={m.id}>
                  <button type="button" onClick={() => onPick(m)}>
                    <MediaThumb item={m} />
                    <span>{m.name}</span>
                    <small>
                      {m.width ? `${m.width}×${m.height} · ` : ''}
                      {formatBytes(m.size)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="Images" title={all.length ? 'Nenhum arquivo com esse nome' : 'A biblioteca ainda não tem arquivos desse tipo'}>
              {all.length ? 'Tente outro nome.' : 'Use “Enviar do dispositivo” para adicionar o primeiro.'}
            </EmptyState>
          )}
        </div>
      )}
    </Modal>
  )
}
