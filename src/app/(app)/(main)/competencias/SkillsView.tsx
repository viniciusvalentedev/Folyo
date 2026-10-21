'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Select, Tabs, Toggle } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { EmptyState, EvidenceMeter, Pill } from '@/components/ui/indicators'
import { ConfirmModal, Modal } from '@/components/ui/Modal'
import { PageHead } from '@/components/ui/PageHead'
import { sameText } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { EvidenceKind, Skill, SkillType, SkillWithEvidence } from '@/lib/types'
import { LIMITS, skillFormSchema } from '@/lib/validation'

export const SKILL_TYPES: Record<SkillType, string> = {
  tecnica: 'Técnica',
  ferramenta: 'Ferramenta',
  comportamental: 'Comportamental',
  idioma: 'Idioma',
}

const EVIDENCE_ICONS: Record<EvidenceKind, IconName> = {
  curso: 'BookOpen',
  projeto: 'FolderKanban',
  experiencia: 'Briefcase',
  certificado: 'Award',
  nota: 'StickyNote',
}

type Filter = 'todas' | SkillType | 'projetos' | 'externas'
type Draft = Pick<Skill, 'name' | 'type' | 'note' | 'inCV'> & { id?: string }

/** Janela para adicionar ou editar uma competência. */
function SkillModal({ value, onClose }: { value: Draft | null; onClose: () => void }) {
  const { s, a, toast } = useApp()
  const [draft, setDraft] = useState<Draft | null>(value)
  const [error, setError] = useState('')
  const [prev, setPrev] = useState(value)
  if (value !== prev) {
    setPrev(value)
    setDraft(value)
    setError('')
  }
  if (!value || !draft) return null
  const isNew = !value.id

  const save = () => {
    const parsed = skillFormSchema.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revise o nome.')
      return
    }
    const { name, type, note, inCV } = parsed.data
    if (s.skills.some((k) => k.id !== draft.id && sameText(k.name, name))) {
      setError('Você já tem uma competência com esse nome.')
      return
    }
    if (isNew) a.addSkill({ name, type, note, inCV })
    else a.updateSkill(draft.id!, { name, type, note, inCV })
    toast(
      isNew ? `${name} adicionada. Ela já aparece no perfil${inCV ? ' e no currículo' : ''}.` : 'Competência atualizada.',
      'ok',
    )
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Adicionar competência' : 'Editar competência'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button icon="Check" onClick={save}>
            {isNew ? 'Adicionar' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Nome" id="sk-name" error={error}>
          <input
            id="sk-name"
            className="inp"
            value={draft.name}
            maxLength={LIMITS.tag}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Ex.: Negociação"
          />
        </Field>
        <Field label="Tipo" id="sk-type">
          <Select
            id="sk-type"
            value={draft.type}
            onChange={(v) => setDraft({ ...draft, type: v })}
            options={Object.entries(SKILL_TYPES).map(([value, label]) => ({ value: value as SkillType, label }))}
          />
        </Field>
        <Field
          label="Evidência fora da Folyo (opcional)"
          id="sk-note"
          hint="Ex.: uso na empresa da família, trabalho voluntário, projeto da escola."
        >
          <textarea
            id="sk-note"
            className="ta"
            rows={3}
            maxLength={LIMITS.short * 2}
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          />
        </Field>
        <Toggle label="Mostrar no currículo" checked={draft.inCV} onChange={(v) => setDraft({ ...draft, inCV: v })} id="sk-cv" />
      </div>
    </Modal>
  )
}

export function SkillsView() {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('todas')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Draft | null>(null)
  const [removing, setRemoving] = useState<SkillWithEvidence | null>(null)

  const tests: Record<Filter, (k: SkillWithEvidence) => boolean> = {
    todas: () => true,
    tecnica: (k) => k.type === 'tecnica',
    ferramenta: (k) => k.type === 'ferramenta',
    comportamental: (k) => k.type === 'comportamental',
    idioma: (k) => k.type === 'idioma',
    projetos: (k) => k.evidence.some((e) => e.kind === 'projeto'),
    externas: (k) => k.evidence.some((e) => e.kind === 'experiencia' || e.kind === 'nota'),
  }
  const list = d.skills.filter(tests[filter]).sort((x, y) => y.level - x.level || x.name.localeCompare(y.name))
  const ladder = [3, 2, 1, 0].map((lv) => d.skills.filter((k) => k.type !== 'idioma' && k.level === lv).length)
  const goal = d.goal
  const missing = goal ? goal.skills.filter((sk) => !s.skills.some((k) => sameText(k.name, sk))) : []
  const courseFor = (name: string) => catalog.courses.find((c) => c.skills.some((x) => sameText(x, name)))

  return (
    <div className="page surface-paper skills-page">
      <PageHead
        eyebrow="Pratique"
        title="Minhas competências"
        lead="Cada competência mostra de onde vem a evidência: curso, projeto, certificado ou experiência fora da Folyo."
        actions={
          <Button icon="Plus" onClick={() => setEditing({ name: '', type: 'tecnica', note: '', inCV: true })}>
            Adicionar competência
          </Button>
        }
      />

      <section className="ladder rise" style={{ '--i': 1 } as CSSProperties} aria-label="Competências por nível de evidência">
        {[
          { l: 3, t: 'Demonstradas', h: 'Com projeto concluído ou certificado' },
          { l: 2, t: 'Praticadas', h: 'Com projeto em andamento ou experiência' },
          { l: 1, t: 'Aprendidas', h: 'Vistas em curso' },
          { l: 0, t: 'Declaradas', h: 'Ainda sem evidência registrada' },
        ].map((step, i) => (
          <div key={step.l} className={'ladder-step l' + step.l}>
            <EvidenceMeter level={step.l} compact />
            <b>{ladder[i]}</b>
            <span>{step.t}</span>
            <small>{step.h}</small>
          </div>
        ))}
      </section>

      <Tabs
        label="Tipos de competência"
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'todas', label: 'Todas', badge: d.skills.length },
          { value: 'tecnica', label: 'Técnicas' },
          { value: 'ferramenta', label: 'Ferramentas' },
          { value: 'idioma', label: 'Idiomas' },
          { value: 'comportamental', label: 'Comportamentais' },
          { value: 'projetos', label: 'De projetos' },
          { value: 'externas', label: 'De experiências externas' },
        ]}
      />

      <div className="skills-cols">
        <ul className="skill-list" key={filter}>
          {list.length === 0 && (
            <li>
              <EmptyState icon="Puzzle" title="Nada nesta categoria">
                Adicione uma competência ou registre as dos seus cursos.
              </EmptyState>
            </li>
          )}
          {list.map((k, i) => {
            const open = openId === k.id
            const course = courseFor(k.name)
            return (
              <li key={k.id} className={'skill-row rise' + (open ? ' open' : '')} style={{ '--i': Math.min(i, 8) } as CSSProperties}>
                <button type="button" className="skill-head" aria-expanded={open} onClick={() => setOpenId(open ? null : k.id)}>
                  <span className="sk-name">
                    <b>{k.name}</b>
                    <small>
                      {SKILL_TYPES[k.type]}
                      {k.type === 'idioma' && k.note ? ` · ${k.note}` : ''}
                    </small>
                  </span>
                  <EvidenceMeter level={k.level} />
                  <span className="sk-ev">{plural(k.evidence.filter((e) => e.kind !== 'nota').length, 'evidência', 'evidências')}</span>
                  {k.inCV ? (
                    <Pill tone="blue" icon="FileText">
                      Currículo
                    </Pill>
                  ) : (
                    <span className="pill-spacer" />
                  )}
                  <Icon name="ChevronDown" size={18} className="chev" />
                </button>
                {open && (
                  <div className="skill-body">
                    <p className="eyebrow">Evidências</p>
                    {k.evidence.length ? (
                      <ul className="ev-list">
                        {k.evidence.map((e, j) => (
                          <li key={j} className={e.strong ? 'strong' : ''}>
                            <Icon name={EVIDENCE_ICONS[e.kind]} size={16} />
                            {e.to ? <Link href={e.to}>{e.label}</Link> : <span>{e.label}</span>}
                            <small>{e.detail}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        Nenhuma evidência ainda. Um projeto que use essa competência é a forma mais forte de demonstrá-la.
                      </p>
                    )}
                    {k.level < 3 && course && (
                      <p className="sk-tip">
                        <Icon name="Lightbulb" size={15} />
                        Para demonstrar: <Link href={'/cursos/' + course.id}>{course.project.title}</Link>, projeto de{' '}
                        {course.title}.
                      </p>
                    )}
                    <div className="skill-actions">
                      <Toggle
                        label="Mostrar no currículo"
                        checked={k.inCV}
                        onChange={(v) => {
                          a.updateSkill(k.id, { inCV: v })
                          toast(v ? `${k.name} incluída no currículo.` : `${k.name} removida do currículo.`, 'ok')
                        }}
                        id={'skcv-' + k.id}
                      />
                      <Button
                        size="sm"
                        variant="quiet"
                        icon="Pencil"
                        onClick={() => setEditing({ id: k.id, name: k.name, type: k.type, note: k.note, inCV: k.inCV })}
                      >
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" icon="Trash2" onClick={() => setRemoving(k)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        <aside className="skills-side">
          {d.unregisteredCourseSkills.length > 0 && (
            <section className="side-card accent">
              <p className="eyebrow">Dos seus cursos concluídos</p>
              <p>Estas competências foram trabalhadas em cursos que você concluiu, mas ainda não estão registradas:</p>
              <div className="chips">
                {d.unregisteredCourseSkills.map((sk) => (
                  <span key={sk} className="chip-static">
                    {sk}
                  </span>
                ))}
              </div>
              <Button
                size="sm"
                icon="Plus"
                onClick={() => {
                  a.registerSkills(d.unregisteredCourseSkills)
                  toast(
                    `${plural(d.unregisteredCourseSkills.length, 'competência registrada', 'competências registradas')}.`,
                    'ok',
                  )
                }}
              >
                Registrar todas
              </Button>
            </section>
          )}
          {goal && (
            <section className="side-card">
              <p className="eyebrow">Para &quot;{goal.title}&quot;</p>
              {missing.length ? (
                <>
                  <p>Competências que ainda faltam para esse objetivo:</p>
                  <ul className="dev-list">
                    {missing.map((sk) => {
                      const c = courseFor(sk)
                      return (
                        <li key={sk}>
                          <b>{sk}</b>
                          {c ? (
                            <Link href={'/cursos/' + c.id}>
                              {c.title}
                              <Icon name="ArrowRight" size={13} />
                            </Link>
                          ) : (
                            <small className="muted">Registre se você já pratica</small>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <p>
                  Você já registrou todas as competências ligadas a esse objetivo. O próximo passo é demonstrá-las com
                  projetos.
                </p>
              )}
              <Button size="sm" variant="quiet" onClick={() => router.push('/objetivos')}>
                Ver objetivos
              </Button>
            </section>
          )}
        </aside>
      </div>

      <SkillModal value={editing} onClose={() => setEditing(null)} />
      <ConfirmModal
        open={!!removing}
        onClose={() => setRemoving(null)}
        danger
        title="Remover competência?"
        confirmLabel="Remover"
        body={removing ? `"${removing.name}" sai do perfil e do currículo. Cursos e projetos não são afetados.` : ''}
        onConfirm={() => {
          if (removing) a.removeSkill(removing.id)
          toast('Competência removida.', 'info')
        }}
      />
    </div>
  )
}
