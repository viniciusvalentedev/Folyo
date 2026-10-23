'use client'

import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Seg, Select, Toggle } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { Ring } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { sameText } from '@/lib/domain/catalog'
import { suggestedObjective } from '@/lib/domain/derive'
import { formatDate } from '@/lib/format'
import type { ProfileListKey, ResumeSection, SkillType, UserProfile } from '@/lib/types'
import { LIMITS } from '@/lib/validation'
import { EXPERIENCE_KINDS, ResumeSheet, SECTION_NAMES, SKILL_GROUPS, Scaled, resumeText } from './ResumeSheet'

const LEVELS = ['Básico (A2)', 'Intermediário (B1)', 'Intermediário avançado (B2)', 'Avançado (C1)', 'Fluente (C2)', 'Nativo']

type AccKey = 'contato' | ResumeSection

/** Item do acordeão do editor. */
function AccItem({
  k,
  title,
  open,
  setOpen,
  done,
  count,
  children,
}: {
  k: AccKey
  title: string
  open: AccKey | null
  setOpen: (k: AccKey | null) => void
  done: boolean
  count?: number
  children: ReactNode
}) {
  const isOpen = open === k
  return (
    <div className={'acc-item' + (isOpen ? ' open' : '')} id={'sec-' + k}>
      <button type="button" className="acc-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : k)}>
        <span className={'acc-state' + (done ? ' ok' : '')}>
          {done ? <Icon name="Check" size={13} /> : <Icon name="Circle" size={10} />}
        </span>
        <b>{title}</b>
        {count !== undefined && <span className="acc-count">{count}</span>}
        <Icon name="ChevronDown" size={18} className="chev" />
      </button>
      {isOpen && <div className="acc-body">{children}</div>}
    </div>
  )
}

type FieldDef = {
  k: string
  label: string
  type?: 'select' | 'textarea'
  options?: { value: string; label: string }[]
  span?: boolean
}

/** Editor de listas do perfil (formação, experiências, conquistas). */
function ListEditor<K extends ProfileListKey>({
  listKey,
  fields,
  empty,
  addLabel,
}: {
  listKey: K
  fields: FieldDef[]
  empty: Omit<UserProfile[K][number], 'id'>
  addLabel: string
}) {
  const { s, a, toast } = useApp()
  const items = s.user[listKey] as unknown as ({ id: string } & Record<string, string>)[]
  return (
    <div className="list-editor">
      {items.map((item) => (
        <div key={item.id} className="le-item">
          <div className="grid-form">
            {fields.map((f) => {
              const id = `${listKey}-${item.id}-${f.k}`
              const update = (v: string) => a.listUpdate(listKey, item.id, { [f.k]: v } as never)
              return (
                <Field key={f.k} label={f.label} id={id} className={f.span ? 'span-2' : ''}>
                  {f.type === 'select' ? (
                    <Select id={id} value={item[f.k]} onChange={update} options={f.options ?? []} />
                  ) : f.type === 'textarea' ? (
                    <textarea id={id} className="ta" rows={2} maxLength={LIMITS.text} value={item[f.k]} onChange={(e) => update(e.target.value)} />
                  ) : (
                    <input id={id} className="inp" maxLength={LIMITS.short} value={item[f.k]} onChange={(e) => update(e.target.value)} />
                  )}
                </Field>
              )
            })}
          </div>
          <button
            type="button"
            className="link-btn danger"
            onClick={() => {
              a.listRemove(listKey, item.id)
              toast('Item removido.', 'info')
            }}
          >
            <Icon name="Trash2" size={14} />
            Remover
          </button>
        </div>
      ))}
      <Button size="sm" variant="quiet" icon="Plus" onClick={() => a.listAdd(listKey, { ...empty })}>
        {addLabel}
      </Button>
    </div>
  )
}

/** Adicionar competência rapidinho, direto do currículo. */
function QuickSkill() {
  const { s, a, toast } = useApp()
  const [name, setName] = useState('')
  const [type, setType] = useState<Exclude<SkillType, 'idioma'>>('tecnica')
  const add = () => {
    const n = name.trim()
    if (!n) return
    if (s.skills.some((k) => sameText(k.name, n))) {
      toast(`"${n}" já está nas suas competências.`, 'err')
      return
    }
    a.addSkill({ name: n, type })
    setName('')
    toast(`${n} adicionada às competências e ao currículo.`, 'ok')
  }
  return (
    <div className="quick-skill">
      <input
        className="inp"
        value={name}
        maxLength={LIMITS.tag}
        placeholder="Nova competência"
        aria-label="Nova competência"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <Select
        label="Tipo"
        value={type}
        onChange={setType}
        options={[
          { value: 'tecnica', label: 'Técnica' },
          { value: 'ferramenta', label: 'Ferramenta' },
          { value: 'comportamental', label: 'Comportamental' },
        ]}
      />
      <Button size="sm" variant="quiet" icon="Plus" onClick={add}>
        Adicionar
      </Button>
    </div>
  )
}

/** Ordem e visibilidade das seções. */
function Organize() {
  const { s, a } = useApp()
  return (
    <div className="organize">
      <p className="muted small">
        Mude a ordem das seções e escolha quais aparecem. Para quem está começando, projetos logo depois do objetivo
        costumam funcionar bem.
      </p>
      <ol className="org-list">
        {s.resume.order.map((sec, i) => {
          const hidden = s.resume.hidden.includes(sec)
          const name = SECTION_NAMES[sec]
          return (
            <li key={sec} className={hidden ? 'hidden-sec' : ''}>
              <span className="org-n">{i + 1}</span>
              <b>{name}</b>
              <IconButton icon="ArrowUp" label={`Mover ${name} para cima`} disabled={i === 0} onClick={() => a.moveSection(sec, -1)} />
              <IconButton
                icon="ArrowDown"
                label={`Mover ${name} para baixo`}
                disabled={i === s.resume.order.length - 1}
                onClick={() => a.moveSection(sec, 1)}
              />
              <IconButton
                icon={hidden ? 'EyeOff' : 'Eye'}
                label={hidden ? `Mostrar ${name}` : `Ocultar ${name}`}
                onClick={() => a.toggleSection(sec)}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export function ResumeView() {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const [panel, setPanel] = useState<'conteudo' | 'organizar'>('conteudo')
  const [open, setOpen] = useState<AccKey | null>('contato')
  const [dismissed, setDismissed] = useState(false)
  const [langDraft, setLangDraft] = useState<{ name: string; level: string } | null>(null)
  const [modal, setModal] = useState<false | 'text' | 'pdf'>(false)
  const [view, setView] = useState<'editar' | 'ver'>('editar')
  const suggestion = suggestedObjective(s)

  const copyText = async (closeModal?: boolean) => {
    try {
      await navigator.clipboard.writeText(resumeText(s, d, catalog))
      toast('Texto do currículo copiado.', 'ok')
      if (closeModal) setModal(false)
    } catch {
      setModal('text')
    }
  }

  const saved = s.resume.dirty
    ? 'Alterações não salvas'
    : s.resume.savedAt
      ? `Salvo em ${formatDate(s.resume.savedAt)} às ${new Date(s.resume.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Ainda não salvo'
  const cvSkillsCount = d.skills.filter((k) => k.inCV && k.type !== 'idioma').length

  return (
    <div className="page surface-paper resume-page">
      <header className="resume-head rise">
        <div>
          <p className="eyebrow">Conquiste</p>
          <h1>Meu currículo</h1>
          <p className={'save-state' + (s.resume.dirty ? ' dirty' : '')}>
            <Icon name={s.resume.dirty ? 'CircleDot' : 'Check'} size={14} />
            {saved}
          </p>
        </div>
        <div className="resume-head-actions">
          <Seg
            label="Modelo de currículo"
            value={s.resume.template}
            onChange={(v) => a.setResume({ template: v })}
            options={[
              { value: 'classico', label: 'Clássico' },
              { value: 'moderno', label: 'Moderno' },
            ]}
            size="sm"
          />
          <Button variant="quiet" icon="Copy" onClick={() => copyText()}>
            Copiar texto
          </Button>
          <Button variant="quiet" icon="Download" onClick={() => setModal('pdf')}>
            Exportar PDF
          </Button>
          <Button
            icon="Check"
            onClick={() => {
              a.saveResume()
              toast('Alterações salvas.', 'ok')
            }}
            disabled={!s.resume.dirty}
          >
            Salvar
          </Button>
        </div>
      </header>

      <div className="resume-mobile-switch only-mobile">
        <Seg
          label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: 'editar', label: 'Editar' },
            { value: 'ver', label: 'Pré-visualizar' },
          ]}
        />
      </div>

      <div className={'resume-split view-' + view}>
        <section className="resume-editor">
          <Seg
            label="Painel"
            value={panel}
            onChange={setPanel}
            options={[
              { value: 'conteudo', label: 'Conteúdo', icon: 'Pencil' },
              { value: 'organizar', label: 'Organizar', icon: 'ListOrdered' },
            ]}
          />
          {panel === 'organizar' && <Organize />}
          {panel === 'conteudo' && (
            <div className="acc">
              <AccItem k="contato" title="Contato" open={open} setOpen={setOpen} done={!!(s.user.email && s.user.phone && s.user.city)}>
                <div className="grid-form">
                  <Field label="Nome" id="cv-name">
                    <input id="cv-name" className="inp" maxLength={80} value={s.user.name} onChange={(e) => a.setUser({ name: e.target.value })} />
                  </Field>
                  <Field label="Cidade" id="cv-city">
                    <input id="cv-city" className="inp" maxLength={80} value={s.user.city} onChange={(e) => a.setUser({ city: e.target.value })} />
                  </Field>
                  <Field label="E-mail" id="cv-email">
                    <input
                      id="cv-email"
                      type="email"
                      className="inp"
                      maxLength={254}
                      value={s.user.email}
                      onChange={(e) => a.setUser({ email: e.target.value })}
                    />
                  </Field>
                  <Field label="Telefone" id="cv-phone">
                    <input
                      id="cv-phone"
                      type="tel"
                      className="inp"
                      maxLength={30}
                      value={s.user.phone}
                      onChange={(e) => a.setUser({ phone: e.target.value })}
                    />
                  </Field>
                  <Field label="Portfólio ou LinkedIn" id="cv-link" className="span-2" hint="Endereço do seu portfólio ou perfil profissional (LinkedIn, Behance, GitHub…).">
                    <input
                      id="cv-link"
                      className="inp"
                      maxLength={200}
                      value={s.user.link}
                      placeholder="linkedin.com/in/seu-nome"
                      onChange={(e) => a.setUser({ link: e.target.value })}
                    />
                  </Field>
                </div>
              </AccItem>

              <AccItem
                k="objetivo"
                title="Objetivo profissional"
                open={open}
                setOpen={setOpen}
                done={d.objectiveStatus === 'ok'}
              >
                <Field id="cv-obj" hint="Diga a área e o tipo de oportunidade. Uma ou duas frases bastam.">
                  <textarea
                    id="cv-obj"
                    className="ta"
                    rows={3}
                    maxLength={500}
                    value={s.user.objective}
                    onChange={(e) => a.setUser({ objective: e.target.value })}
                    aria-label="Objetivo profissional"
                  />
                </Field>
                {d.objectiveStatus === 'generico' && !dismissed && (
                  <div className="suggest-box">
                    <p className="eyebrow">Sugestão a partir do seu objetivo principal</p>
                    <p>{suggestion}</p>
                    <small className="muted">Montada com base em &quot;{d.goal?.title}&quot;. Ajuste com suas palavras.</small>
                    <div className="row gap-s">
                      <Button
                        size="sm"
                        onClick={() => {
                          a.setUser({ objective: suggestion })
                          setDismissed(true)
                          toast('Objetivo atualizado.', 'ok')
                        }}
                      >
                        Usar sugestão
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                        Dispensar
                      </Button>
                    </div>
                  </div>
                )}
              </AccItem>

              <AccItem
                k="formacao"
                title="Formação"
                open={open}
                setOpen={setOpen}
                done={s.user.education.length > 0}
                count={s.user.education.length}
              >
                <ListEditor
                  listKey="education"
                  fields={[
                    { k: 'course', label: 'Curso' },
                    { k: 'inst', label: 'Instituição' },
                    { k: 'period', label: 'Período' },
                  ]}
                  empty={{ course: '', inst: '', period: '' }}
                  addLabel="Adicionar formação"
                />
              </AccItem>

              <AccItem
                k="experiencia"
                title="Experiências"
                open={open}
                setOpen={setOpen}
                done={s.user.experiences.length > 0}
                count={s.user.experiences.length}
              >
                <p className="muted small">
                  Inclua trabalho formal, empresa da família, grêmio, voluntariado e projetos de grupo. O que conta é o
                  que você fez de verdade.
                </p>
                <ListEditor
                  listKey="experiences"
                  fields={[
                    {
                      k: 'kind',
                      label: 'Tipo',
                      type: 'select',
                      options: Object.entries(EXPERIENCE_KINDS).map(([value, label]) => ({ value, label })),
                    },
                    { k: 'role', label: 'Função' },
                    { k: 'org', label: 'Organização' },
                    { k: 'period', label: 'Período' },
                    { k: 'desc', label: 'O que você fazia', type: 'textarea', span: true },
                  ]}
                  empty={{ kind: 'profissional', role: '', org: '', period: '', desc: '', skills: [] }}
                  addLabel="Adicionar experiência"
                />
              </AccItem>

              <AccItem
                k="projetos"
                title="Projetos"
                open={open}
                setOpen={setOpen}
                done={d.cvProjects.length >= 2}
                count={d.cvProjects.length}
              >
                {d.works.length ? (
                  <ul className="pick-list">
                    {d.works.map((w) => (
                      <li key={w.id}>
                        <div>
                          <b>{w.title}</b>
                          <small>
                            {w.course ? w.course.title : 'Fora da Folyo'} · {w.kind === 'pdf' ? 'PDF' : 'Link'}
                          </small>
                        </div>
                        <Toggle
                          label={w.inCV ? 'Incluído' : 'Incluir'}
                          checked={w.inCV}
                          onChange={(v) => a.toggleWorkCV(w.id, v)}
                          id={'cvp-' + w.id}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">Os projetos que você anexar (PDF ou link) aparecem aqui para entrar no currículo.</p>
                )}
                <Button size="sm" variant="quiet" icon="FileUp" onClick={() => router.push('/projetos')}>
                  Anexar projeto
                </Button>
              </AccItem>

              <AccItem
                k="cursos"
                title="Cursos e certificados"
                open={open}
                setOpen={setOpen}
                done={s.resume.certs.length > 0}
                count={s.resume.certs.length}
              >
                <ul className="pick-list">
                  {[...d.completedCourses, ...d.inProgress].map((c) => {
                    const st = d.courseStats[c.id]
                    const on = s.resume.certs.includes(c.id)
                    return (
                      <li key={c.id}>
                        <div>
                          <b>{c.title}</b>
                          <small>
                            {st.certified
                              ? `Certificado · ${formatDate(st.certDate)}`
                              : st.complete
                                ? 'Aulas concluídas · falta o projeto'
                                : `Em andamento · ${st.pct}%`}
                          </small>
                        </div>
                        <Toggle label={on ? 'Incluído' : 'Incluir'} checked={on} onChange={(v) => a.toggleCertCV(c.id, v)} id={'cvc-' + c.id} />
                      </li>
                    )
                  })}
                </ul>
              </AccItem>

              <AccItem k="competencias" title="Competências" open={open} setOpen={setOpen} done={cvSkillsCount >= 5} count={cvSkillsCount}>
                {(['tecnica', 'ferramenta', 'comportamental'] as SkillType[]).map((t) => (
                  <div key={t} className="skill-group">
                    <p className="eyebrow">{SKILL_GROUPS[t]}</p>
                    <div className="chips">
                      {d.skills
                        .filter((k) => k.type === t)
                        .map((k) => (
                          <button
                            key={k.id}
                            type="button"
                            className={'chip-toggle' + (k.inCV ? ' on' : '')}
                            aria-pressed={k.inCV}
                            onClick={() => a.updateSkill(k.id, { inCV: !k.inCV })}
                          >
                            <Icon name={k.inCV ? 'Check' : 'Plus'} size={13} />
                            {k.name}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
                <QuickSkill />
              </AccItem>

              <AccItem
                k="idiomas"
                title="Idiomas"
                open={open}
                setOpen={setOpen}
                done={s.user.languages.some((l) => sameText(l.name, 'Inglês'))}
                count={s.user.languages.length}
              >
                <ul className="lang-list">
                  {s.user.languages.map((l) => (
                    <li key={l.id}>
                      <input
                        className="inp"
                        maxLength={40}
                        value={l.name}
                        aria-label="Idioma"
                        onChange={(e) => a.listUpdate('languages', l.id, { name: e.target.value })}
                      />
                      <Select
                        label={'Nível de ' + l.name}
                        value={l.level}
                        onChange={(v) => a.listUpdate('languages', l.id, { level: v })}
                        options={LEVELS}
                      />
                      <IconButton icon="Trash2" label={'Remover ' + l.name} onClick={() => a.listRemove('languages', l.id)} />
                    </li>
                  ))}
                </ul>
                {langDraft ? (
                  <div className="lang-draft">
                    <input
                      className="inp"
                      maxLength={40}
                      value={langDraft.name}
                      aria-label="Novo idioma"
                      onChange={(e) => setLangDraft({ ...langDraft, name: e.target.value })}
                    />
                    <Select
                      label="Nível"
                      value={langDraft.level}
                      onChange={(v) => setLangDraft({ ...langDraft, level: v })}
                      options={[{ value: '', label: 'Escolha o nível' }, ...LEVELS.map((x) => ({ value: x, label: x }))]}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        if (!langDraft.name.trim() || !langDraft.level) {
                          toast('Informe o idioma e escolha o nível.', 'err')
                          return
                        }
                        a.listAdd('languages', { name: langDraft.name.trim(), level: langDraft.level })
                        toast(`${langDraft.name} adicionado.`, 'ok')
                        setLangDraft(null)
                      }}
                    >
                      Adicionar
                    </Button>
                    <IconButton icon="X" label="Cancelar" onClick={() => setLangDraft(null)} />
                  </div>
                ) : (
                  <Button size="sm" variant="quiet" icon="Plus" onClick={() => setLangDraft({ name: '', level: '' })}>
                    Adicionar idioma
                  </Button>
                )}
                <p className="muted small">
                  Escolha o nível que você consegue demonstrar hoje. O curso de inglês em andamento não altera o nível
                  automaticamente.
                </p>
              </AccItem>

              <AccItem
                k="conquistas"
                title="Conquistas e atividades"
                open={open}
                setOpen={setOpen}
                done={s.user.achievements.length > 0}
                count={s.user.achievements.length}
              >
                <ListEditor
                  listKey="achievements"
                  fields={[{ k: 'text', label: 'Conquista ou atividade', span: true }]}
                  empty={{ text: '' }}
                  addLabel="Adicionar conquista"
                />
              </AccItem>
            </div>
          )}
        </section>

        <section className="resume-preview-wrap" aria-label="Pré-visualização do currículo">
          <div className="preview-bar">
            <span className="muted">Pré-visualização · A4</span>
            <span className="complete-chip">
              <Ring value={d.completeness} size={22} stroke={3} tone="var(--blue)" track="var(--line)" />
              Preenchimento {Math.round(d.completeness)}%
            </span>
          </div>
          <Scaled>
            <ResumeSheet s={s} d={d} catalog={catalog} />
          </Scaled>
        </section>
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(false)}
        title={modal === 'text' ? 'Copiar texto do currículo' : 'Exportar em PDF'}
        size="md"
        footer={
          <Button variant="ghost" onClick={() => setModal(false)}>
            Fechar
          </Button>
        }
      >
        {modal === 'pdf' ? (
          <div className="stack">
            <div className="alert alert-info">
              <Icon name="Info" size={18} />
              <div>
                A exportação em PDF ainda não está disponível. Ela vai gerar um arquivo A4 com o modelo{' '}
                <b>{s.resume.template === 'classico' ? 'Clássico' : 'Moderno'}</b>, exatamente como na pré-visualização.
              </div>
            </div>
            <p className="muted">Enquanto isso, você pode copiar o texto do currículo e colar em um editor.</p>
            <Button icon="Copy" onClick={() => copyText(true)}>
              Copiar texto do currículo
            </Button>
          </div>
        ) : (
          <div className="stack">
            <p className="muted">Seu navegador bloqueou a cópia automática. Selecione o texto abaixo e copie.</p>
            <textarea
              className="ta mono"
              rows={12}
              readOnly
              value={resumeText(s, d, catalog)}
              onFocus={(e) => e.target.select()}
              aria-label="Texto do currículo"
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
