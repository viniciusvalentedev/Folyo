'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { saveCourseAction } from '@/lib/actions/catalog'
import {
  courseCounts,
  courseSignature,
  slugify,
  validateCourse,
  type AdminCourse,
  type CourseErrors,
} from '@/lib/admin/catalog'
import { AdminHead, Notice } from '../ui'
import { CourseActions } from './CourseActions'
import { ContentTab } from './editor/ContentTab'
import { InfoTab } from './editor/InfoTab'
import { PreviewTab } from './editor/PreviewTab'
import { PublishTab } from './editor/PublishTab'
import type { EditorContext } from './editor/types'
import { VisualTab } from './editor/VisualTab'
import { StatusBadge } from './parts'

export type EditorTab = 'informacoes' | 'visual' | 'conteudo' | 'publicacao' | 'previa'
export const EDITOR_TABS: EditorTab[] = ['informacoes', 'visual', 'conteudo', 'publicacao', 'previa']

const TAB_LIST: { value: EditorTab; label: string; icon: 'Pencil' | 'Palette' | 'Layers' | 'Send' | 'Eye' }[] = [
  { value: 'informacoes', label: 'Informações', icon: 'Pencil' },
  { value: 'visual', label: 'Capa e visual', icon: 'Palette' },
  { value: 'conteudo', label: 'Módulos e aulas', icon: 'Layers' },
  { value: 'publicacao', label: 'Publicação e acesso', icon: 'Send' },
  { value: 'previa', label: 'Prévia', icon: 'Eye' },
]

/**
 * Editor de curso (novo ou existente). O rascunho vive aqui no navegador; "Salvar" manda o curso
 * inteiro numa operação só para o servidor, que repassa ao banco (ele confere tudo de novo,
 * avisa se outra pessoa editou o mesmo curso no meio tempo e registra no histórico).
 */
export function CourseEditor({
  initial,
  isNew,
  ctx,
  canDelete,
  initialTab,
}: {
  initial: AdminCourse
  isNew: boolean
  ctx: EditorContext
  canDelete: boolean
  initialTab: EditorTab
}) {
  const { toast } = useApp()
  const router = useRouter()
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [tab, setTab] = useState<EditorTab>(initialTab)
  const [errors, setErrors] = useState<CourseErrors>({})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [auto, setAuto] = useState(true)
  const [leaveTo, setLeaveTo] = useState<string | null>(null)

  const dirty = courseSignature(draft) !== courseSignature(saved)
  const set = (patch: Partial<AdminCourse>) => setDraft((d) => ({ ...d, ...patch }))

  const save = async (opts: { silent?: boolean; force?: boolean } = {}): Promise<boolean> => {
    if (busy) return false
    const found = validateCourse(draft, ctx.others)
    if (Object.keys(found).length) {
      if (!opts.silent) {
        setErrors(found)
        setTab('informacoes')
        toast('Corrija os campos destacados para salvar.', 'err')
      }
      return false
    }
    setErrors({})
    setError('')
    setBusy(true)
    const snapshot = draft
    const id = isNew ? snapshot.id || slugify(snapshot.title) : snapshot.id
    const r = await saveCourseAction({
      course: { ...snapshot, id, title: snapshot.title.trim() },
      isNew,
      expected: isNew ? null : saved.updatedAt,
      force: !!opts.force,
    })
    setBusy(false)
    if (!r.ok) {
      if (r.code === 'FA409') setConflict(true)
      setError(r.error)
      if (!opts.silent) toast(r.error, 'err')
      return false
    }
    setConflict(false)
    setSaved({ ...snapshot, id: r.id, updatedAt: r.updatedAt, createdAt: saved.createdAt ?? new Date().toISOString() })
    setDraft((d) => ({ ...d, id: r.id, updatedAt: r.updatedAt }))
    setSavedAt(new Date().toISOString())
    if (!opts.silent) {
      toast(
        isNew ? 'Curso criado.' : 'Alterações salvas.',
        'ok',
        snapshot.status === 'publicado' ? { title: 'Publicado', actionLabel: 'Ver no catálogo', onAction: () => router.push('/cursos/' + r.id) } : {},
      )
    }
    if (isNew) router.replace('/admin/cursos/' + r.id)
    return true
  }

  // Sempre a versão mais recente da função, para o temporizador e o Ctrl+S não usarem dados velhos.
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  // Salvamento automático só para rascunhos de cursos que já existem.
  useEffect(() => {
    if (isNew || !auto || !dirty || draft.status !== 'rascunho' || conflict) return
    const timer = setTimeout(() => void saveRef.current({ silent: true }), 2500)
    return () => clearTimeout(timer)
  }, [draft, isNew, auto, dirty, conflict])

  // Ctrl/Cmd + S.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Sair sem salvar: fechar a aba e clicar em qualquer link do painel pedem confirmação.
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setLeaveTo(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  const counts = courseCounts(draft)
  const problemTabs = Object.keys(errors).length

  return (
    <div className="ad-page ad-editor">
      <button type="button" className="ad-back" onClick={() => (dirty ? setLeaveTo('/admin/cursos') : router.push('/admin/cursos'))}>
        <Icon name="ArrowLeft" size={16} />
        Cursos
      </button>
      <AdminHead
        title={isNew ? 'Novo curso' : draft.title || 'Sem título'}
        actions={!isNew ? <CourseActions course={{ id: saved.id, title: saved.title, status: saved.status }} canDelete={canDelete} afterDelete="/admin/cursos" onPreview={() => setTab('previa')} /> : null}
      >
        <div className="ad-ed-meta">
          {!isNew && <StatusBadge status={saved.status} publishAt={saved.publishAt} />}
          <span>
            {counts.modules} módulos · {counts.lessons} aulas ({counts.published} publicadas)
          </span>
        </div>
      </AdminHead>

      <div className="ad-savebar" aria-live="polite">
        <span className={'ad-save-state ' + (busy ? 'busy' : dirty ? 'dirty' : 'ok')}>
          <Icon name={busy ? 'RefreshCw' : dirty ? 'CircleDot' : 'CircleCheck'} size={14} className={busy ? 'spin' : ''} />
          {busy ? 'Salvando…' : dirty ? 'Alterações não salvas' : savedAt ? `Salvo às ${new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Nada para salvar'}
        </span>
        {!isNew && draft.status === 'rascunho' && (
          <label className="ad-check">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span>Salvar automaticamente (rascunho)</span>
          </label>
        )}
        <span className="grow" />
        {dirty && !isNew && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(structuredClone(saved))
              setErrors({})
              setError('')
            }}
          >
            Descartar
          </Button>
        )}
        <Button size="sm" icon="Save" onClick={() => void save()} disabled={busy || (!dirty && !isNew)}>
          {isNew ? 'Criar curso' : 'Salvar'}
        </Button>
      </div>

      {conflict && (
        <Notice
          tone="warn"
          action={
            <div className="ad-conflict-actions">
              <Button variant="quiet" size="sm" onClick={() => router.refresh()}>
                Carregar a versão nova
              </Button>
              <Button size="sm" disabled={busy} onClick={() => void save({ force: true })}>
                Salvar e substituir
              </Button>
            </div>
          }
        >
          {error || 'Este curso foi alterado em outro lugar enquanto você editava.'} Se salvar agora, a sua versão substitui a outra.
        </Notice>
      )}
      {error && !conflict && <Notice tone="err">{error}</Notice>}

      <Tabs<EditorTab>
        label="Seções do curso"
        value={tab}
        onChange={setTab}
        tabs={TAB_LIST.map((t) => ({ ...t, badge: t.value === 'informacoes' && problemTabs ? String(problemTabs) : null }))}
      />
      <div className="ad-ed-body">
        {tab === 'informacoes' && <InfoTab draft={draft} set={set} errors={errors} ctx={ctx} />}
        {tab === 'visual' && <VisualTab draft={draft} set={set} />}
        {tab === 'conteudo' && <ContentTab draft={draft} set={set} />}
        {tab === 'publicacao' && <PublishTab draft={draft} set={set} errors={errors} ctx={ctx} />}
        {tab === 'previa' && <PreviewTab draft={draft} categories={ctx.categories} />}
      </div>

      <Modal
        open={!!leaveTo}
        onClose={() => setLeaveTo(null)}
        size="sm"
        title="Sair sem salvar?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLeaveTo(null)}>
              Continuar editando
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const to = leaveTo
                setLeaveTo(null)
                // Descarta de verdade: sem alterações pendentes, o aviso de saída não volta a aparecer.
                setDraft(structuredClone(saved))
                if (to) setTimeout(() => router.push(to), 0)
              }}
            >
              Sair e descartar
            </Button>
            <Button
              onClick={async () => {
                const to = leaveTo
                setLeaveTo(null)
                if ((await save()) && to) setTimeout(() => router.push(to), 0)
              }}
            >
              Salvar e sair
            </Button>
          </>
        }
      >
        <p className="muted">Há alterações neste curso que ainda não foram salvas.</p>
      </Modal>
    </div>
  )
}
