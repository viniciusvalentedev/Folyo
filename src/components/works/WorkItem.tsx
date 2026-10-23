'use client'

import { useRef, useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/controls'
import { ConfirmModal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/format'
import { formatFileSize, hostOf, pdfUrl } from '@/lib/pdf-file'
import type { Work } from '@/lib/types'

/** Uma linha da lista de materiais (PDF ou link) de um curso. */
export function WorkItem({ work, onView, onEdit }: { work: Work; onView: (w: Work) => void; onEdit: (w: Work) => void }) {
  const { a, toast } = useApp()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const isPdf = work.kind === 'pdf'
  const openHref = isPdf ? pdfUrl(work.id) : work.url

  const replace = async (file: File) => {
    setBusy(true)
    const result = await a.replacePdf(work.id, file)
    setBusy(false)
    toast(result.ok ? 'Arquivo substituído.' : result.error, result.ok ? 'ok' : 'err')
  }

  return (
    <li className={'work' + (busy ? ' busy' : '')}>
      <span className={'work-ico ' + work.kind}>
        <Icon name={isPdf ? 'FileText' : 'Link'} size={18} />
      </span>
      <div className="work-text">
        <b>{work.title}</b>
        <small>
          {isPdf && work.file ? `PDF · ${formatFileSize(work.file.size)}` : hostOf(work.url ?? '')} · {formatDate((work.updatedAt || work.createdAt).slice(0, 10))}
        </small>
        {work.desc && <p>{work.desc}</p>}
      </div>
      <div className="work-pub">
        <Toggle
          id={'pub-' + work.id}
          label={work.public ? 'Público' : 'Privado'}
          checked={work.public}
          onChange={(on) => {
            a.updateWork(work.id, { public: on })
            toast(on ? 'Vai aparecer no seu portfólio público.' : 'Saiu do portfólio público.', 'info')
          }}
        />
      </div>
      <div className="work-actions">
        {isPdf && <IconButton icon="Eye" label={`Visualizar ${work.title}`} onClick={() => onView(work)} />}
        {openHref && (
          <a className="icon-btn" href={openHref} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${work.title}`} title="Abrir">
            <Icon name="ExternalLink" size={18} />
          </a>
        )}
        <IconButton icon="Pencil" label={`Editar ${work.title}`} onClick={() => onEdit(work)} />
        {isPdf && (
          <>
            <IconButton icon="Replace" label={`Substituir o PDF de ${work.title}`} disabled={busy} onClick={() => input.current?.click()} />
            <input
              ref={input}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void replace(file)
              }}
            />
          </>
        )}
        <IconButton icon="Trash2" label={`Excluir ${work.title}`} className="danger" onClick={() => setConfirming(true)} />
      </div>
      <ConfirmModal
        open={confirming}
        onClose={() => setConfirming(false)}
        danger
        title="Excluir material?"
        confirmLabel="Excluir"
        body={`"${work.title}" sai deste curso e do portfólio público.${isPdf ? ' O arquivo é apagado da sua conta.' : ''} Essa ação não pode ser desfeita.`}
        onConfirm={() => {
          a.removeWork(work.id)
          toast('Material excluído.', 'info')
        }}
      />
    </li>
  )
}
