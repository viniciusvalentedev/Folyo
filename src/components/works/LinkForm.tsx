'use client'

import { useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/controls'
import { Modal } from '@/components/ui/Modal'
import { EXTERNAL } from '@/lib/pdf-file'
import type { Work } from '@/lib/types'
import { normalizeWorkUrl, WORK_DESC_MAX, WORK_TITLE_MAX } from '@/lib/validation'

/** Janela para adicionar um link (ou editar título e descrição de um material). */
export function LinkForm({ open, onClose, cid, item }: { open: boolean; onClose: () => void; cid: string; item: Work | null }) {
  const { a, toast } = useApp()
  const [form, setForm] = useState({ title: '', desc: '', url: '' })
  const [errors, setErrors] = useState<Partial<Record<'title' | 'desc' | 'url', string>>>({})

  // Ao abrir (ou trocar o item), o formulário recomeça com os dados dele.
  const [seen, setSeen] = useState<{ open: boolean; item: Work | null }>({ open: false, item: null })
  if (seen.open !== open || seen.item !== item) {
    setSeen({ open, item })
    if (open) {
      setForm({ title: item ? item.title : '', desc: item?.desc ?? '', url: item?.url ?? '' })
      setErrors({})
    }
  }

  const isLink = item ? item.kind === 'link' : true

  const submit = () => {
    const found: typeof errors = {}
    let host = ''
    if (isLink) {
      const checked = normalizeWorkUrl(form.url)
      if ('error' in checked) found.url = checked.error
      else host = checked.host
    }
    if (!isLink && !form.title.trim()) found.title = 'Dê um título ao material.'
    if (form.title.length > WORK_TITLE_MAX) found.title = `Use até ${WORK_TITLE_MAX} caracteres.`
    if (form.desc.length > WORK_DESC_MAX) found.desc = `Use até ${WORK_DESC_MAX} caracteres.`
    setErrors(found)
    if (Object.keys(found).length) return

    const title = form.title.trim() || host
    if (item) {
      const result = a.updateWork(item.id, isLink ? { title, desc: form.desc.trim(), url: form.url } : { title, desc: form.desc.trim() })
      if (!result.ok) {
        toast(result.error, 'err')
        return
      }
      toast('Material atualizado.', 'ok')
    } else {
      const result = a.addLinkWork({ courseId: cid === EXTERNAL ? null : cid, title, desc: form.desc, url: form.url, public: false })
      if (!result.ok) {
        toast(result.error, 'err')
        return
      }
      toast('Link adicionado.', 'ok')
    }
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? 'Editar material' : 'Adicionar link'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="Check" onClick={submit}>
            {item ? 'Salvar' : 'Adicionar link'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {isLink && (
          <Field label="Endereço do link" id="wf-url" error={errors.url} hint="Campanha publicada, apresentação, repositório, estudo de caso…">
            <input
              id="wf-url"
              className="inp"
              inputMode="url"
              value={form.url}
              placeholder="https://"
              maxLength={500}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              autoFocus
            />
          </Field>
        )}
        <Field label={isLink ? 'Título (opcional)' : 'Título'} id="wf-title" error={errors.title} hint={isLink ? 'Sem título, usamos o nome do site.' : undefined}>
          <input id="wf-title" className="inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus={!isLink} />
        </Field>
        <Field label="Descrição (opcional)" id="wf-desc" error={errors.desc} hint={`${form.desc.length}/${WORK_DESC_MAX} · o que é e o que você fez`}>
          <textarea id="wf-desc" className="ta" rows={3} value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}
