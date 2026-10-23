'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo, useRef, useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { deleteMediaAction, updateMediaAction } from '@/lib/actions/media'
import { ALT_MAX, FILE_ACCEPT, formatBytes, IMAGE_ACCEPT, imageUrl, NAME_MAX, type MediaItem, type MediaUse } from '@/lib/media'
import { inspectLocalFile, uploadLocalFile } from '@/lib/media-upload'
import { AdminHead, Notice } from '../ui'
import { MediaThumb } from './MediaThumb'

type Filter = 'todos' | 'image' | 'file'
type Upload = { key: number; name: string; state: 'fila' | 'enviando' | 'ok' | 'erro'; error?: string }

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })

/** Biblioteca de mídia: imagens (capas, banners, categorias) e PDFs (materiais das aulas). */
export function MediaLibrary({ items, usage, canDelete }: { items: MediaItem[]; usage: Record<string, MediaUse[]>; canDelete: boolean }) {
  const router = useRouter()
  const { toast } = useApp()
  const [list, setList] = useState(items)
  const [filter, setFilter] = useState<Filter>('todos')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [queue, setQueue] = useState<Upload[]>([])
  const [drag, setDrag] = useState(false)
  const counter = useRef(0)
  const inputId = useId()

  // Quando o servidor manda a lista de novo (depois de router.refresh), ela vira a verdade.
  const [seen, setSeen] = useState(items)
  if (seen !== items) {
    setSeen(items)
    setList(items)
  }

  const busy = queue.some((u) => u.state === 'fila' || u.state === 'enviando')
  const shown = useMemo(
    () => list.filter((m) => (filter === 'todos' || m.kind === filter) && (!q.trim() || m.name.toLowerCase().includes(q.trim().toLowerCase()))),
    [list, filter, q],
  )
  const totals = useMemo(() => {
    const t = { image: 0, file: 0, imageBytes: 0, fileBytes: 0 }
    for (const m of list) {
      t[m.kind] += 1
      t[m.kind === 'image' ? 'imageBytes' : 'fileBytes'] += m.size
    }
    return t
  }, [list])
  const current = open ? list.find((m) => m.id === open) : undefined

  const patchQueue = (key: number, patch: Partial<Upload>) => setQueue((qs) => qs.map((u) => (u.key === key ? { ...u, ...patch } : u)))

  const sendAll = async (files: File[]) => {
    const batch = files.slice(0, 20).map((f) => ({ key: ++counter.current, file: f }))
    setQueue((qs) => [...qs.filter((u) => u.state === 'erro'), ...batch.map((b) => ({ key: b.key, name: b.file.name, state: 'fila' as const }))])
    let sent = 0
    for (const { key, file } of batch) {
      patchQueue(key, { state: 'enviando' })
      const want = file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'file' : 'image'
      const checked = await inspectLocalFile(file, want)
      if (!checked.ok) {
        patchQueue(key, { state: 'erro', error: checked.error })
        continue
      }
      const res = await uploadLocalFile(checked.local)
      if (!res.ok) {
        patchQueue(key, { state: 'erro', error: res.error })
        continue
      }
      sent += 1
      patchQueue(key, { state: 'ok' })
      setList((l) => [res.item, ...l])
    }
    if (sent) {
      toast(sent === 1 ? 'Arquivo enviado.' : `${sent} arquivos enviados.`, 'ok')
      router.refresh()
    }
    setTimeout(() => setQueue((qs) => qs.filter((u) => u.state === 'erro')), 4000)
  }

  return (
    <div className="ad-page">
      <AdminHead
        title="Biblioteca de mídia"
        lead={`${totals.image} ${totals.image === 1 ? 'imagem' : 'imagens'} (${formatBytes(totals.imageBytes)}) e ${totals.file} ${totals.file === 1 ? 'PDF' : 'PDFs'} (${formatBytes(totals.fileBytes)}). Vídeos ficam no Bunny Stream e são enviados dentro de cada aula.`}
        actions={
          <label className={'btn btn-primary' + (busy ? ' is-disabled' : '')} htmlFor={inputId} style={{ cursor: busy ? 'default' : 'pointer' }}>
            <Icon name="Upload" size={16} />
            Enviar arquivos
          </label>
        }
      />
      <input
        id={inputId}
        type="file"
        multiple
        className="sr-only"
        accept={`${IMAGE_ACCEPT},${FILE_ACCEPT}`}
        disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) void sendAll(files)
        }}
      />

      <div
        className={'ad-lib-wrap' + (drag ? ' drag' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDrag(false)
          const files = [...e.dataTransfer.files]
          if (files.length && !busy) void sendAll(files)
        }}
      >
        <div className="ad-lib-bar">
          <input className="inp" placeholder="Buscar pelo nome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar na biblioteca" />
          <Seg<Filter>
            label="Tipo"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: `Tudo (${list.length})` },
              { value: 'image', label: `Imagens (${totals.image})`, icon: 'Image' },
              { value: 'file', label: `PDFs (${totals.file})`, icon: 'FileText' },
            ]}
          />
        </div>

        {queue.length > 0 && (
          <ul className="ad-upload-list" aria-live="polite">
            {queue.map((u) => (
              <li key={u.key} className={u.state === 'erro' ? 'err' : ''}>
                <Icon name={u.state === 'ok' ? 'Check' : u.state === 'erro' ? 'CircleAlert' : 'RefreshCw'} size={14} className={u.state === 'enviando' ? 'spin' : ''} />
                <span>
                  {u.name}
                  {u.state === 'fila' && ' · na fila'}
                  {u.state === 'enviando' && ' · enviando…'}
                  {u.state === 'erro' && ` · ${u.error}`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {shown.length ? (
          <ul className="ad-media-grid">
            {shown.map((m) => {
              const uses = usage[m.id]?.length ?? 0
              return (
                <li key={m.id}>
                  <button type="button" onClick={() => setOpen(m.id)}>
                    <MediaThumb item={m} />
                    <b title={m.name}>{m.name}</b>
                    <small>
                      {m.width ? `${m.width}×${m.height} · ` : ''}
                      {formatBytes(m.size)} · {uses ? `em ${uses} ${uses === 1 ? 'lugar' : 'lugares'}` : 'sem uso'}
                    </small>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon="Images" title={list.length ? 'Nenhum arquivo encontrado' : 'A biblioteca está vazia'}>
            {list.length ? 'Mude a busca ou o filtro.' : 'Arraste imagens (PNG, JPG, WebP) e PDFs para cá, ou use “Enviar arquivos”.'}
          </EmptyState>
        )}
        <p className="ad-help">PNG, JPG ou WebP até 5 MB · PDF até 20 MB · até 20 arquivos por vez.</p>
      </div>

      {current && (
        <MediaDetail
          key={current.id + current.updatedAt}
          item={current}
          uses={usage[current.id] ?? []}
          canDelete={canDelete}
          onClose={() => setOpen(null)}
          onChanged={(next) => setList((l) => l.map((m) => (m.id === next.id ? next : m)))}
          onDeleted={(id) => {
            setList((l) => l.filter((m) => m.id !== id))
            setOpen(null)
          }}
        />
      )}
    </div>
  )
}

function MediaDetail({
  item,
  uses,
  canDelete,
  onClose,
  onChanged,
  onDeleted,
}: {
  item: MediaItem
  uses: MediaUse[]
  canDelete: boolean
  onClose: () => void
  onChanged: (item: MediaItem) => void
  onDeleted: (id: string) => void
}) {
  const router = useRouter()
  const { toast } = useApp()
  const [name, setName] = useState(item.name)
  const [alt, setAlt] = useState(item.alt)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [pending, start] = useTransition()
  const replaceId = useId()
  const dirty = name.trim() !== item.name || alt.trim() !== item.alt
  const viewHref = `/api/admin/midia/${item.id}`

  const save = () =>
    start(async () => {
      setError('')
      const res = await updateMediaAction({ id: item.id, name: name.trim(), alt: alt.trim() })
      if (!res.ok) return setError(res.error)
      onChanged({ ...item, name: name.trim(), alt: alt.trim(), updatedAt: new Date().toISOString() })
      toast('Alterações salvas.', 'ok')
      router.refresh()
    })

  const remove = () =>
    start(async () => {
      setError('')
      const res = await deleteMediaAction({ id: item.id })
      if (!res.ok) {
        setConfirm(false)
        return setError(res.error)
      }
      toast('Arquivo excluído.', 'ok')
      onDeleted(item.id)
      router.refresh()
    })

  const replace = async (file: File) => {
    setError('')
    setReplacing(true)
    const checked = await inspectLocalFile(file, item.kind)
    if (!checked.ok) {
      setReplacing(false)
      return setError(checked.error)
    }
    const res = await uploadLocalFile(checked.local, { replace: item })
    setReplacing(false)
    if (!res.ok) return setError(res.error)
    onChanged(res.item)
    toast(uses.length ? 'Arquivo trocado em todos os lugares que o usam.' : 'Arquivo trocado.', 'ok')
    router.refresh()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={item.kind === 'image' ? 'Imagem' : 'PDF'}
      footer={
        <>
          {canDelete && (
            <Button variant="danger" icon="Trash2" disabled={pending || replacing || uses.length > 0} onClick={() => setConfirm(true)} title={uses.length ? 'Tire o arquivo dos lugares onde ele é usado para poder excluir.' : undefined}>
              Excluir
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button disabled={!dirty || pending || !name.trim()} onClick={save}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="ad-media-detail">
        <div className="ad-media-preview">
          {item.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
            <img src={imageUrl(item.path)} alt={item.alt} />
          ) : (
            <a className="ad-media-pdf" href={viewHref} target="_blank" rel="noopener noreferrer">
              <Icon name="FileText" size={40} />
              <b>Abrir o PDF</b>
              <small>abre em outra aba</small>
            </a>
          )}
        </div>
        <div className="ad-media-fields">
          <Field label="Nome" id="m-name">
            <input id="m-name" className="inp" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
          </Field>
          {item.kind === 'image' && (
            <Field label="Texto alternativo" id="m-alt" hint="Descreve a imagem para quem usa leitor de tela. Cada curso pode ter o seu texto.">
              <input id="m-alt" className="inp" value={alt} maxLength={ALT_MAX} onChange={(e) => setAlt(e.target.value)} />
            </Field>
          )}
          <p className="ad-help">
            {item.width ? `${item.width}×${item.height} px · ` : ''}
            {formatBytes(item.size)} · enviado em {dateFmt.format(new Date(item.createdAt))}
          </p>
          <div>
            <label className="btn btn-ghost btn-sm" htmlFor={replaceId} style={{ cursor: replacing ? 'default' : 'pointer' }}>
              <Icon name="RefreshCw" size={14} className={replacing ? 'spin' : ''} />
              {replacing ? 'Trocando…' : 'Trocar o arquivo'}
            </label>
            <input
              id={replaceId}
              type="file"
              className="sr-only"
              accept={item.kind === 'image' ? IMAGE_ACCEPT : FILE_ACCEPT}
              disabled={replacing || pending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void replace(f)
              }}
            />
            <p className="ad-help">Mantém o mesmo lugar de uso: quem usa este arquivo passa a mostrar o novo.</p>
          </div>

          <h3 className="ad-label">Onde é usado</h3>
          {uses.length ? (
            <ul className="ad-uses">
              {uses.map((u, i) => (
                <li key={i}>
                  <Link href={u.courseId ? `/admin/cursos/${u.courseId}` : '/admin/categorias'}>{u.courseTitle}</Link>
                  <small>
                    {u.where}
                    {u.courseId && !u.published ? ' · curso não publicado' : ''}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="ad-help">Este arquivo ainda não é usado em nenhum curso ou categoria.</p>
          )}
        </div>
      </div>
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Excluir arquivo?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={pending} onClick={remove}>
              Excluir de vez
            </Button>
          </>
        }
      >
        <p className="muted">“{item.name}” sai da biblioteca e do armazenamento. Isso não pode ser desfeito.</p>
      </Modal>
    </Modal>
  )
}
