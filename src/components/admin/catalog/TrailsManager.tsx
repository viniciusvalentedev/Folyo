'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { ChipInput, Field, Toggle } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { deleteTrailAction, reorderTrailsAction, saveTrailAction } from '@/lib/actions/trails'
import { CATEGORY_ICONS, slugify } from '@/lib/admin/catalog'
import { TRAIL_LIMITS as L } from '@/lib/admin/trails'
import { handleGroupKeys } from '@/lib/a11y'
import { sameText } from '@/lib/domain/catalog'
import type { Trail } from '@/lib/trails'
import { AdminHead, Notice } from '../ui'
import { ReorderModal } from './ReorderModal'

type CourseOption = { id: string; title: string; skills: string[]; live: boolean }

type Props = {
  trails: Trail[]
  /** false = o SQL das trilhas ainda não foi rodado (valem as 7 de sempre, sem edição). */
  saved: boolean
  courses: CourseOption[]
}

/** Quantos cursos no ar a trilha mostra aos alunos: os escolhidos à mão ou, sem escolha, os que ensinam as skills dela. */
function liveCount(trail: Trail, courses: CourseOption[]) {
  if (trail.courseIds.length) return trail.courseIds.filter((id) => courses.some((c) => c.id === id && c.live)).length
  return courses.filter((c) => c.live && c.skills.some((s) => trail.skills.some((t) => sameText(t, s)))).length
}

const payload = (t: Trail) => ({ id: t.id, title: t.title, blurb: t.blurb, icon: t.icon, skills: t.skills, keywords: t.keywords, courseIds: t.courseIds, active: t.active })

export function TrailsManager({ trails, saved, courses }: Props) {
  const router = useRouter()
  const { toast } = useApp()
  const [edit, setEdit] = useState<{ trail: Trail; isNew: boolean } | null>(null)
  const [removing, setRemoving] = useState<Trail | null>(null)
  const [reorder, setReorder] = useState(false)
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const toggleActive = (t: Trail) =>
    start(async () => {
      setError('')
      const r = await saveTrailAction({ trail: payload({ ...t, active: !t.active }), isNew: false })
      if (!r.ok) return setError(r.error)
      toast(t.active ? 'Trilha desativada: ela some de Objetivos para os alunos.' : 'Trilha ativada.', 'ok')
      router.refresh()
    })

  return (
    <div className="ad-page">
      <AdminHead
        title="Trilhas de carreira"
        lead="As trilhas aparecem em Objetivos > Escolher objetivos, na ordem definida aqui. Cada trilha tem um objetivo, as skills que ela pede e um pacote de cursos. Trilhas desativadas somem da escolha, mas continuam valendo para quem já as escolheu."
        actions={
          <>
            <Button variant="quiet" icon="ArrowUpDown" disabled={!saved || trails.length < 2} onClick={() => setReorder(true)}>
              Reordenar
            </Button>
            <Button
              icon="Plus"
              disabled={!saved}
              onClick={() => setEdit({ isNew: true, trail: { id: '', title: '', blurb: '', icon: 'Target', skills: [], keywords: [], courseIds: [], active: true } })}
            >
              Nova trilha
            </Button>
          </>
        }
      />
      {!saved && (
        <Notice tone="warn">
          O banco ainda não tem a tabela de trilhas, então valem as 7 trilhas de sempre e elas não podem ser editadas. Rode no Supabase o arquivo <b>20261030000004_trilhas.sql</b> (passo a passo em supabase/README.md) e recarregue esta página.
        </Notice>
      )}
      {error && <Notice tone="err">{error}</Notice>}

      <div className="panel flush">
        {trails.length ? (
          <ul className="ad-cats">
            {trails.map((t, i) => {
              const picked = t.courseIds.length
              const live = liveCount(t, courses)
              return (
                <li key={t.id} className={t.active ? '' : 'off'}>
                  <span className="ad-cat-n">{i + 1}</span>
                  <span className="ad-cat-ico">
                    <Icon name={t.icon} size={18} />
                  </span>
                  <span className="ad-cat-t">
                    <b>{t.title}</b>
                    <small>
                      {t.blurb || 'Sem descrição'} · {picked ? `${picked} ${picked === 1 ? 'curso escolhido' : 'cursos escolhidos'} à mão` : 'cursos automáticos pelas skills'} · {live} no ar
                    </small>
                  </span>
                  <label className="ad-switch">
                    <input type="checkbox" checked={t.active} disabled={pending || !saved} onChange={() => toggleActive(t)} />
                    <span>{t.active ? 'Ativa' : 'Inativa'}</span>
                  </label>
                  <IconButton icon="SquarePen" label={`Editar ${t.title}`} disabled={!saved} onClick={() => setEdit({ trail: { ...t }, isNew: false })} />
                  <IconButton icon="Trash2" label={`Excluir ${t.title}`} disabled={!saved} onClick={() => (setError(''), setRemoving(t))} />
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon="Target" title="Nenhuma trilha">
            Crie a primeira trilha para ela aparecer em Objetivos.
          </EmptyState>
        )}
      </div>

      {edit && <TrailDialog key={edit.trail.id || 'nova'} value={edit} others={trails} courses={courses} onClose={() => setEdit(null)} />}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Excluir trilha?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!removing) return
                  const r = await deleteTrailAction({ id: removing.id })
                  if (!r.ok) {
                    setRemoving(null)
                    return setError(r.error)
                  }
                  toast('Trilha excluída.', 'ok')
                  setRemoving(null)
                  router.refresh()
                })
              }
            >
              Excluir
            </Button>
          </>
        }
      >
        {removing && (
          <p className="muted">
            “{removing.title}” será removida de Objetivos. Se algum aluno já escolheu essa trilha, o sistema não deixa excluir: nesse caso, desative a trilha.
          </p>
        )}
      </Modal>

      <ReorderModal
        open={reorder}
        onClose={() => setReorder(false)}
        items={trails.map((t) => ({ id: t.id, label: t.title }))}
        title="Ordem das trilhas"
        hint="É a ordem das trilhas em Objetivos > Escolher objetivos."
        onSave={async (ids) => {
          const r = await reorderTrailsAction({ ids })
          if (r.ok) {
            toast('Ordem das trilhas salva.', 'ok')
            router.refresh()
          }
          return r
        }}
      />
    </div>
  )
}

function TrailDialog({ value, others, courses, onClose }: { value: { trail: Trail; isNew: boolean }; others: Trail[]; courses: CourseOption[]; onClose: () => void }) {
  const router = useRouter()
  const { toast } = useApp()
  const [trail, setTrail] = useState(value.trail)
  const [titleError, setTitleError] = useState('')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()
  const byId = new Map(courses.map((c) => [c.id, c]))
  const allSkills = [...new Set(courses.flatMap((c) => c.skills))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const available = courses.filter((c) => !trail.courseIds.includes(c.id))

  const moveCourse = (from: number, step: number) => {
    const to = from + step
    if (to < 0 || to >= trail.courseIds.length) return
    const next = [...trail.courseIds]
    ;[next[from], next[to]] = [next[to], next[from]]
    setTrail({ ...trail, courseIds: next })
  }

  const save = () => {
    const title = trail.title.trim()
    if (title.length < L.title.min) return setTitleError(`Dê um nome com pelo menos ${L.title.min} caracteres.`)
    if (others.some((o) => o.id !== trail.id && o.title.trim().toLowerCase() === title.toLowerCase())) return setTitleError('Já existe uma trilha com esse nome.')
    setTitleError('')
    start(async () => {
      setError('')
      const id = trail.id || slugify(title, 'trilha')
      const r = await saveTrailAction({ trail: payload({ ...trail, id, title }), isNew: value.isNew })
      if (!r.ok) return setError(r.error)
      toast(value.isNew ? 'Trilha criada.' : 'Trilha atualizada.', 'ok')
      onClose()
      router.refresh()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={value.isNew ? 'Nova trilha' : 'Editar trilha'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending} onClick={save}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="ad-fgrid">
        <Field label="Nome (o objetivo do aluno) *" id="trail-title" error={titleError} className="span-2" hint="Ex.: Construir carreira em Marketing. Vira o texto do objetivo quando o aluno aplica a trilha.">
          <input id="trail-title" className="inp" value={trail.title} maxLength={L.title.max} onChange={(e) => setTrail({ ...trail, title: e.target.value })} />
        </Field>
        <Field label="Descrição" id="trail-blurb" className="span-2">
          <textarea id="trail-blurb" className="ta" rows={2} maxLength={L.blurb} value={trail.blurb} onChange={(e) => setTrail({ ...trail, blurb: e.target.value })} />
        </Field>
      </div>

      <p className="ad-label">Ícone</p>
      <div className="ad-icon-grid" role="radiogroup" aria-label="Ícone" onKeyDown={(e) => handleGroupKeys(e, '[role="radio"]', { select: true, vertical: true })}>
        {CATEGORY_ICONS.map((name, i) => (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={trail.icon === name}
            aria-label={name}
            tabIndex={((CATEGORY_ICONS as readonly string[]).includes(trail.icon) ? trail.icon === name : i === 0) ? 0 : -1}
            className={trail.icon === name ? 'on' : ''}
            onClick={() => setTrail({ ...trail, icon: name })}
          >
            <Icon name={name} size={18} />
          </button>
        ))}
      </div>

      <p className="ad-label" style={{ marginTop: 14 }}>
        Skills da trilha
      </p>
      <ChipInput id="trail-skills" values={trail.skills} onChange={(skills) => setTrail({ ...trail, skills })} suggestions={allSkills} placeholder="Skill e Enter" max={L.skills.items} maxLength={L.skills.length} />
      <p className="ad-help">São somadas aos objetivos do aluno quando ele aplica a trilha. Use os mesmos nomes das skills dos cursos.</p>

      <p className="ad-label" style={{ marginTop: 14 }}>
        Palavras-chave
      </p>
      <ChipInput id="trail-keywords" values={trail.keywords} onChange={(keywords) => setTrail({ ...trail, keywords })} placeholder="Palavra e Enter" max={L.keywords.items} maxLength={L.keywords.length} />
      <p className="ad-help">Ajudam a reconhecer a área no texto do objetivo profissional do currículo.</p>

      <p className="ad-label" style={{ marginTop: 14 }}>
        Pacote de cursos
      </p>
      <p className="ad-help">
        Escolha os cursos à mão, na ordem em que aparecem. Sem nenhum curso escolhido, a trilha mostra automaticamente os cursos que ensinam as skills dela.
      </p>
      {trail.courseIds.length > 0 && (
        <ul className="ad-simple">
          {trail.courseIds.map((id, i) => {
            const course = byId.get(id)
            return (
              <li key={id}>
                <span className="ad-order-n">{i + 1}</span>
                <span className="grow">
                  {course ? course.title : 'Curso removido'}
                  {course && !course.live && <small> · fora do ar (não aparece para os alunos)</small>}
                </span>
                <IconButton icon="ChevronUp" label={`Subir ${course?.title ?? id}`} disabled={i === 0} onClick={() => moveCourse(i, -1)} />
                <IconButton icon="ChevronDown" label={`Descer ${course?.title ?? id}`} disabled={i === trail.courseIds.length - 1} onClick={() => moveCourse(i, 1)} />
                <IconButton icon="X" label={`Tirar ${course?.title ?? id}`} onClick={() => setTrail({ ...trail, courseIds: trail.courseIds.filter((x) => x !== id) })} />
              </li>
            )
          })}
        </ul>
      )}
      <Field label="Adicionar curso" id="trail-add" className="span-2">
        <select
          id="trail-add"
          className="inp"
          value=""
          disabled={trail.courseIds.length >= L.courses || !available.length}
          onChange={(e) => e.target.value && setTrail({ ...trail, courseIds: [...trail.courseIds, e.target.value] })}
        >
          <option value="">
            {trail.courseIds.length >= L.courses ? `Máximo de ${L.courses} cursos` : available.length ? 'Escolha um curso…' : 'Todos os cursos já estão na trilha'}
          </option>
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.live ? '' : ' (fora do ar)'}
            </option>
          ))}
        </select>
      </Field>

      <Toggle label="Trilha ativa" hint="Inativa, ela não aparece em Objetivos para novos alunos." checked={trail.active} onChange={(active) => setTrail({ ...trail, active })} />
      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="err">{error}</Notice>
        </div>
      )}
    </Modal>
  )
}
