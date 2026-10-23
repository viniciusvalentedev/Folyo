'use client'

import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Select, Seg, Toggle } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import {
  CATALOG_LIMITS as L,
  isExternalVideo,
  isHttpsUrl,
  newId,
  type AdminCourse,
  type AdminLesson,
  type AdminModule,
} from '@/lib/admin/catalog'
import { Notice } from '../../ui'

type Dialog = { mi: number; lesson: AdminLesson; isNew: boolean }
type Removal = { kind: 'mod'; mi: number } | { kind: 'lesson'; mi: number; lid: string; title: string }

const blankLesson = (): AdminLesson => ({ id: newId('l'), title: '', desc: '', min: 10, published: true, video: null, materials: [] })

/** Aba "Módulos e aulas": criar, reordenar (setas ou arrastando), arquivar e excluir. */
export function ContentTab({ draft, set }: { draft: AdminCourse; set: (patch: Partial<AdminCourse>) => void }) {
  const modules = draft.modules
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [drag, setDrag] = useState<number | null>(null)

  const total = modules.reduce((n, m) => n + m.lessons.length, 0)
  const setModules = (next: AdminModule[]) => set({ modules: next })
  const patchModule = (mi: number, patch: Partial<AdminModule>) => setModules(modules.map((m, i) => (i === mi ? { ...m, ...patch } : m)))

  const moveModule = (mi: number, step: number) => {
    const to = mi + step
    if (to < 0 || to >= modules.length) return
    const next = [...modules]
    ;[next[mi], next[to]] = [next[to], next[mi]]
    setModules(next)
  }
  const moveLesson = (mi: number, li: number, step: number) => {
    const lessons = [...modules[mi].lessons]
    const to = li + step
    if (to < 0 || to >= lessons.length) return
    ;[lessons[li], lessons[to]] = [lessons[to], lessons[li]]
    patchModule(mi, { lessons })
  }
  const addModule = () =>
    setModules([...modules, { id: newId('m'), title: `Módulo ${modules.length + 1}`, desc: '', archived: false, lessons: [] }])

  /** Grava a aula do diálogo: no módulo escolhido, na mesma posição se ele não mudou. */
  const saveLesson = (from: number, lesson: AdminLesson, to: number) => {
    const without = modules.map((m) => ({ ...m, lessons: m.lessons.filter((l) => l.id !== lesson.id) }))
    const index = modules[from].lessons.findIndex((l) => l.id === lesson.id)
    if (to === from && index >= 0) without[to].lessons.splice(index, 0, lesson)
    else without[to].lessons.push(lesson)
    setModules(without)
    setDialog(null)
  }

  // Número da aula como o aluno vê: só aulas publicadas de módulos ativos.
  const numbers = new Map<string, number>()
  let counter = 0
  for (const m of modules) if (!m.archived) for (const l of m.lessons) if (l.published) numbers.set(l.id, ++counter)

  return (
    <div className="ad-content">
      <div className="ad-sec-head">
        <p className="ad-help">
          Arraste os módulos ou use as setas para mudar a ordem. Aulas despublicadas e módulos arquivados somem para os alunos quando você salvar. O progresso já registrado
          não é apagado.
        </p>
        <Button icon="Plus" variant="quiet" onClick={addModule} disabled={modules.length >= L.modules}>
          Novo módulo
        </Button>
      </div>

      {!modules.length && (
        <EmptyState
          icon="Layers"
          title="Este curso ainda não tem módulos"
          action={
            <Button icon="Plus" onClick={addModule}>
              Criar o primeiro módulo
            </Button>
          }
        >
          Organize as aulas em módulos. Um curso precisa de pelo menos uma aula publicada, com vídeo, para ser publicado.
        </EmptyState>
      )}

      {modules.map((m, mi) => (
        <section
          key={m.id}
          className={'ad-mod' + (m.archived ? ' archived' : '') + (drag === mi ? ' dragging' : '')}
          draggable
          onDragStart={(e) => {
            if ((e.target as HTMLElement).closest('input,textarea,button')) {
              e.preventDefault()
              return
            }
            setDrag(mi)
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (drag === null || drag === mi) return
            const next = [...modules]
            const [moved] = next.splice(drag, 1)
            next.splice(mi, 0, moved)
            setModules(next)
            setDrag(mi)
          }}
          onDragEnd={() => setDrag(null)}
        >
          <header className="ad-mod-head">
            <Icon name="GripVertical" size={16} className="ad-grip" />
            <span className="ad-mod-n">Módulo {mi + 1}</span>
            <input
              className="inp inp-sm ad-mod-title"
              value={m.title}
              maxLength={L.moduleTitle}
              aria-label={`Título do módulo ${mi + 1}`}
              onChange={(e) => patchModule(mi, { title: e.target.value })}
            />
            {m.archived && (
              <span className="ad-badge ad-badge-warn">
                <Icon name="Archive" size={12} />
                Arquivado
              </span>
            )}
            <IconButton icon="ChevronUp" label="Subir módulo" disabled={mi === 0} onClick={() => moveModule(mi, -1)} />
            <IconButton icon="ChevronDown" label="Descer módulo" disabled={mi === modules.length - 1} onClick={() => moveModule(mi, 1)} />
            <IconButton
              icon={m.archived ? 'Undo2' : 'Archive'}
              label={m.archived ? 'Restaurar módulo' : 'Arquivar módulo'}
              onClick={() => patchModule(mi, { archived: !m.archived })}
            />
            <IconButton icon="Trash2" label="Excluir módulo" onClick={() => setRemoval({ kind: 'mod', mi })} />
          </header>
          <textarea
            className="ta ad-mod-desc"
            rows={1}
            maxLength={L.moduleDesc}
            placeholder="Descrição do módulo (opcional)"
            value={m.desc}
            aria-label={`Descrição do módulo ${mi + 1}`}
            onChange={(e) => patchModule(mi, { desc: e.target.value })}
          />
          <ol className="ad-lessons">
            {m.lessons.map((l, li) => (
              <li key={l.id} className={l.published ? '' : 'unpub'}>
                <span className="ad-l-n">{numbers.get(l.id) ?? '–'}</span>
                <button type="button" className="ad-l-main" onClick={() => setDialog({ mi, lesson: structuredClone(l), isNew: false })}>
                  <b>{l.title || 'Aula sem título'}</b>
                  <small>
                    {l.min} min · {l.video ? 'vídeo por link' : 'sem vídeo'}
                    {l.materials.length ? ` · ${l.materials.length} ${l.materials.length === 1 ? 'material' : 'materiais'}` : ''}
                  </small>
                </button>
                <label className="ad-switch" title={l.published ? 'Publicada' : 'Despublicada'}>
                  <input
                    type="checkbox"
                    checked={l.published}
                    onChange={(e) => patchModule(mi, { lessons: m.lessons.map((x) => (x.id === l.id ? { ...x, published: e.target.checked } : x)) })}
                  />
                  <span>{l.published ? 'Publicada' : 'Rascunho'}</span>
                </label>
                <IconButton icon="ChevronUp" label="Subir aula" disabled={li === 0} onClick={() => moveLesson(mi, li, -1)} />
                <IconButton icon="ChevronDown" label="Descer aula" disabled={li === m.lessons.length - 1} onClick={() => moveLesson(mi, li, 1)} />
                <IconButton icon="Trash2" label="Excluir aula" onClick={() => setRemoval({ kind: 'lesson', mi, lid: l.id, title: l.title })} />
              </li>
            ))}
          </ol>
          <div>
            <Button
              variant="ghost"
              size="sm"
              icon="Plus"
              disabled={total >= L.lessonsPerCourse || m.lessons.length >= L.lessonsPerModule}
              onClick={() => setDialog({ mi, lesson: blankLesson(), isNew: true })}
            >
              Nova aula
            </Button>
          </div>
        </section>
      ))}

      {dialog && <LessonDialog key={dialog.lesson.id} dialog={dialog} modules={modules} onClose={() => setDialog(null)} onSave={saveLesson} />}

      <Modal
        open={!!removal}
        onClose={() => setRemoval(null)}
        size="sm"
        title={removal?.kind === 'mod' ? 'Excluir módulo?' : 'Excluir aula?'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoval(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!removal) return
                if (removal.kind === 'mod') setModules(modules.filter((_, i) => i !== removal.mi))
                else patchModule(removal.mi, { lessons: modules[removal.mi].lessons.filter((l) => l.id !== removal.lid) })
                setRemoval(null)
              }}
            >
              Excluir
            </Button>
          </>
        }
      >
        {removal && (
          <>
            <p className="muted">
              {removal.kind === 'mod'
                ? `O módulo e suas ${modules[removal.mi]?.lessons.length ?? 0} aulas saem do curso.`
                : `A aula "${removal.title || 'sem título'}" sai do curso.`}{' '}
              A exclusão só vale depois de salvar.
            </p>
            <div style={{ marginTop: 12 }}>
              <Notice tone="warn">
                Se algum aluno já assistiu ou concluiu {removal.kind === 'mod' ? 'aulas deste módulo' : 'esta aula'}, o histórico dele continua guardado, mas o conteúdo deixa de aparecer. Se a ideia é
                esconder por um tempo, prefira {removal.kind === 'mod' ? 'arquivar o módulo' : 'despublicar a aula'}.
              </Notice>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

function LessonDialog({
  dialog,
  modules,
  onClose,
  onSave,
}: {
  dialog: Dialog
  modules: AdminModule[]
  onClose: () => void
  onSave: (from: number, lesson: AdminLesson, to: number) => void
}) {
  const [lesson, setLesson] = useState(dialog.lesson)
  const [target, setTarget] = useState(dialog.mi)
  const [errors, setErrors] = useState<{ title?: string; min?: string; video?: string }>({})
  const [mat, setMat] = useState({ label: '', url: '' })
  const patch = (p: Partial<AdminLesson>) => setLesson((l) => ({ ...l, ...p }))
  const videoUrl = lesson.video?.url ?? ''
  const external = isExternalVideo(videoUrl)

  const apply = () => {
    const next: typeof errors = {}
    if (lesson.title.trim().length < L.lessonTitle.min) next.title = 'Dê um título com pelo menos 3 caracteres.'
    if (!(Number.isInteger(lesson.min) && lesson.min >= L.lessonMin.min && lesson.min <= L.lessonMin.max)) next.min = 'Informe a duração em minutos (1 a 300).'
    if (lesson.video && !isHttpsUrl(lesson.video.url)) next.video = 'Use um endereço que comece com https://'
    setErrors(next)
    if (Object.keys(next).length) return
    onSave(dialog.mi, { ...lesson, title: lesson.title.trim() }, target)
  }

  const addMaterial = () => {
    if (!mat.label.trim() || !isHttpsUrl(mat.url) || lesson.materials.length >= L.materials) return
    patch({ materials: [...lesson.materials, { id: newId('mt'), label: mat.label.trim().slice(0, L.materialLabel), url: mat.url.trim() }] })
    setMat({ label: '', url: '' })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={dialog.isNew ? 'Nova aula' : 'Editar aula'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply}>{dialog.isNew ? 'Adicionar aula' : 'Aplicar'}</Button>
        </>
      }
    >
      <div className="ad-fgrid">
        <Field label="Título da aula *" id="l-title" error={errors.title} className="span-2">
          <input id="l-title" className="inp" value={lesson.title} maxLength={L.lessonTitle.max} onChange={(e) => patch({ title: e.target.value })} />
        </Field>
        <Field label="Descrição" id="l-desc" className="span-2" hint="Aparece em “Sobre a aula”, abaixo do vídeo.">
          <textarea id="l-desc" className="ta" rows={3} maxLength={L.lessonDesc} value={lesson.desc} onChange={(e) => patch({ desc: e.target.value })} />
        </Field>
        <Field label="Duração estimada (min) *" id="l-min" error={errors.min}>
          <input
            id="l-min"
            className="inp"
            type="number"
            min={L.lessonMin.min}
            max={L.lessonMin.max}
            value={Number.isFinite(lesson.min) ? lesson.min : ''}
            onChange={(e) => patch({ min: e.target.value === '' ? NaN : Number(e.target.value) })}
          />
        </Field>
        <Field label="Módulo" id="l-mod">
          <Select<string>
            id="l-mod"
            label="Módulo"
            value={String(target)}
            onChange={(v) => setTarget(Number(v))}
            options={modules.map((m, i) => ({ value: String(i), label: `Módulo ${i + 1} · ${m.title}` }))}
          />
        </Field>
        <div className="span-2">
          <Toggle label="Aula publicada" hint="Despublicada, a aula fica salva aqui mas não aparece para os alunos." checked={lesson.published} onChange={(published) => patch({ published })} />
        </div>
      </div>

      <section className="ad-fs">
        <h3>Vídeo</h3>
        <Seg<'nenhum' | 'link'>
          label="Origem do vídeo"
          value={lesson.video ? 'link' : 'nenhum'}
          onChange={(v) => patch({ video: v === 'link' ? { url: '' } : null })}
          options={[
            { value: 'nenhum', label: 'Sem vídeo' },
            { value: 'link', label: 'Link', icon: 'Link' },
          ]}
        />
        {!lesson.video && (
          <p className="ad-help">
            Sem vídeo, a aula pode ficar salva, mas o curso só é publicado quando todas as aulas publicadas têm vídeo. Até lá, o aluno veria um aviso de vídeo indisponível. O envio de
            arquivos de vídeo chega na próxima fase.
          </p>
        )}
        {lesson.video && (
          <Field
            label="Endereço do vídeo"
            id="l-url"
            error={errors.video}
            hint={
              external
                ? 'YouTube e Vimeo abrem no site deles: o aluno assiste por lá e a audiência não é medida na Folyo.'
                : 'Link direto para um arquivo .mp4 ou .webm. A reprodução é medida na audiência.'
            }
          >
            <input id="l-url" className="inp" value={videoUrl} maxLength={L.url} placeholder="https://" onChange={(e) => patch({ video: { url: e.target.value.trim() } })} />
          </Field>
        )}
      </section>

      <section className="ad-fs">
        <h3>Materiais complementares</h3>
        {lesson.materials.length ? (
          <ul className="ad-mats">
            {lesson.materials.map((x, i) => (
              <li key={x.id}>
                <Icon name="Link" size={16} />
                <input
                  className="inp inp-sm"
                  value={x.label}
                  maxLength={L.materialLabel}
                  aria-label="Nome do material"
                  onChange={(e) => patch({ materials: lesson.materials.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })}
                />
                <small>{x.url}</small>
                <IconButton icon="X" label="Remover material" onClick={() => patch({ materials: lesson.materials.filter((_, j) => j !== i) })} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="ad-help">Nenhum material ainda.</p>
        )}
        <div className="ad-mat-add">
          <input className="inp inp-sm" placeholder="Nome do link" maxLength={L.materialLabel} value={mat.label} aria-label="Nome do link" onChange={(e) => setMat({ ...mat, label: e.target.value })} />
          <input className="inp inp-sm" placeholder="https://" maxLength={L.url} value={mat.url} aria-label="Endereço do link" onChange={(e) => setMat({ ...mat, url: e.target.value })} />
          <Button size="sm" variant="quiet" icon="Link" disabled={!mat.label.trim() || !isHttpsUrl(mat.url) || lesson.materials.length >= L.materials} onClick={addMaterial}>
            Adicionar link
          </Button>
        </div>
        <p className="ad-help">Arquivos (PDF, planilhas) poderão ser enviados na próxima fase; por enquanto use links.</p>
      </section>
    </Modal>
  )
}
