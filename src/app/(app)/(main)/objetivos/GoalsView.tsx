'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { PageHead } from '@/components/ui/PageHead'
import { SoonBlock } from '@/components/ui/SoonBlock'
import { categoryOf, sameText } from '@/lib/domain/catalog'
import { catalogSkills, recommendCourses, skillInCatalog, trailWithCourses, type CatalogSkill } from '@/lib/domain/derive'
import { plural } from '@/lib/format'
import { chooseableTrails, findTrail, GENERIC_SKILLS } from '@/lib/trails'

const EXAMPLES = [
  'Construir uma carreira em marketing digital',
  'Tornar-me uma profissional de vendas',
  'Desenvolver habilidades para empreender',
  'Construir uma carreira em programação',
]
const OBJECTIVE_MAX = 160

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function GoalsView() {
  const { catalog } = useApp()
  const skills = useMemo(() => catalogSkills(catalog), [catalog])
  return (
    <div className="page surface-paper goals-page">
      <PageHead
        eyebrow="Direção"
        title="Objetivos"
        lead="Defina a identidade profissional que você quer construir: qual é o seu objetivo, quais skills quer desenvolver e quais cursos levam você até lá."
      />
      <ObjectiveBox />
      <div className="goal-detail2">
        <SkillPicker skills={skills} />
        <Recommended />
      </div>
      <Trails skills={skills} />
    </div>
  )
}

/** 1. Qual é o meu objetivo? Texto livre, salvo na conta. */
function ObjectiveBox() {
  const { s, a, toast, catalog } = useApp()
  const saved = s.goals.text || ''
  const [text, setText] = useState(saved)
  const dirty = text.trim() !== saved.trim()
  const trail = findTrail(catalog.trails, s.goals.primary)
  const last = useRef(saved)

  // Se o objetivo mudou por outro caminho (ex.: aplicar uma trilha), acompanha, sem perder o que está sendo digitado.
  useEffect(() => {
    if (last.current !== saved) {
      if (text.trim() === last.current.trim()) setText(saved)
      last.current = saved
    }
  }, [saved, text])

  const save = () => {
    const clean = text.trim().replace(/\s+/g, ' ')
    if (clean.length > OBJECTIVE_MAX) {
      toast(`Use até ${OBJECTIVE_MAX} caracteres.`, 'err')
      return
    }
    a.setGoalText(clean)
    setText(clean)
    toast(clean ? 'Objetivo salvo.' : 'Objetivo removido.', 'ok')
  }

  return (
    <section className="obj-hero rise" style={{ '--i': 1 } as CSSProperties} aria-labelledby="obj-label">
      <div className="obj-q">
        <span>1</span>Qual é o meu objetivo?
      </div>
      <label id="obj-label" htmlFor="obj-text" className="obj-k">
        Objetivo principal
      </label>
      <textarea
        id="obj-text"
        className="obj-ta"
        rows={2}
        maxLength={OBJECTIVE_MAX}
        value={text}
        placeholder="Escreva com as suas palavras. Ex.: construir uma carreira em marketing digital."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
        }}
      />
      <div className="obj-foot">
        <span className={'obj-state' + (dirty ? ' dirty' : '')}>
          <Icon name={dirty ? 'CircleDot' : 'Check'} size={14} />
          {dirty ? 'Alterações não salvas' : saved ? 'Salvo na sua conta' : 'Ainda sem objetivo'}
        </span>
        <span className="obj-count">
          {text.length}/{OBJECTIVE_MAX}
        </span>
        {trail && (
          <span className="obj-trail">
            <Icon name={trail.icon} size={14} />
            Trilha: {trail.title}
          </span>
        )}
        <div className="obj-actions">
          {dirty && (
            <Button variant="ghost-on-blue" size="sm" onClick={() => setText(saved)}>
              Descartar
            </Button>
          )}
          <Button variant="go" size="sm" icon="Check" disabled={!dirty} onClick={save}>
            Salvar objetivo
          </Button>
        </div>
      </div>
      {!saved && !text && (
        <div className="obj-ex">
          <small>Exemplos:</small>
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => setText(example)}>
              {example}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function SkillChip({ name, on, onToggle, missing }: { name: string; on: boolean; onToggle: () => void; missing?: boolean }) {
  return (
    <button
      type="button"
      className={'skp-chip' + (on ? ' on' : '')}
      aria-pressed={on}
      onClick={onToggle}
      title={missing ? 'Nenhum curso publicado ensina esta skill agora' : undefined}
    >
      <Icon name={on ? 'Check' : 'Plus'} size={14} />
      {name}
      {missing && <em>sem curso</em>}
    </button>
  )
}

/** 2. Quais skills quero desenvolver? */
function SkillPicker({ skills }: { skills: CatalogSkill[] }) {
  const { s, a, catalog } = useApp()
  const [all, setAll] = useState(false)
  const chosen = s.goals.skills
  const isChosen = (name: string) => chosen.some((k) => sameText(k, name))
  const trail = trailWithCourses(findTrail(catalog.trails, s.goals.primary), catalog, skills)

  const shown: string[] = []
  const add = (name: string) => {
    if (!shown.some((x) => sameText(x, name))) shown.push(name)
  }
  chosen.forEach(add)
  trail?.liveSkills.forEach(add)
  skills.forEach((k) => shown.length < 18 && add(k.name))
  GENERIC_SKILLS.forEach((k) => shown.length < 18 && add(k))

  return (
    <section className="goal-sec rise" style={{ '--i': 2 } as CSSProperties} aria-labelledby="h-comp">
      <header className="goal-sec-head">
        <div>
          <div className="obj-q dark">
            <span>2</span>Quais skills quero desenvolver?
          </div>
          <h2 id="h-comp" className="h-sec">
            Competências do objetivo
          </h2>
        </div>
        <button type="button" className="link-btn" onClick={() => setAll(true)}>
          <Icon name="LayoutGrid" size={15} />
          Ver todas as skills
        </button>
      </header>
      <p className="muted small">
        Toque para selecionar ou remover.{' '}
        {chosen.length ? <b className="skp-count">{plural(chosen.length, 'skill selecionada', 'skills selecionadas')}</b> : 'Nenhuma selecionada ainda.'}
      </p>
      <div className="skp-chips" role="group" aria-label="Skills desejadas">
        {shown.map((name) => (
          <SkillChip key={name} name={name} on={isChosen(name)} missing={!skillInCatalog(skills, name)} onToggle={() => a.toggleGoalSkill(name)} />
        ))}
      </div>
      <AllSkills open={all} onClose={() => setAll(false)} skills={skills} />
    </section>
  )
}

/** Janela com todas as skills do catálogo, agrupadas por categoria. */
function AllSkills({ open, onClose, skills }: { open: boolean; onClose: () => void; skills: CatalogSkill[] }) {
  const { s, a, catalog } = useApp()
  const [query, setQuery] = useState('')
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setQuery('')
  }
  const isChosen = (name: string) => s.goals.skills.some((k) => sameText(k, name))
  const q = normalize(query.trim())
  const found = skills.filter((k) => !q || normalize(k.name).includes(q))
  const groups: Record<string, CatalogSkill[]> = {}
  for (const skill of found) {
    const category = categoryOf(catalog, skill.cats[0]).name
    ;(groups[category] = groups[category] || []).push(skill)
  }
  const withoutCourse = s.goals.skills.filter((k) => !skillInCatalog(skills, k) && (!q || normalize(k).includes(q)))
  const soon = GENERIC_SKILLS.filter((k) => !skillInCatalog(skills, k) && !isChosen(k) && (!q || normalize(k).includes(q)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Todas as skills"
      eyebrow={`${plural(skills.length, 'skill no catálogo', 'skills no catálogo')} · ${plural(s.goals.skills.length, 'selecionada', 'selecionadas')}`}
      size="lg"
      footer={
        <Button onClick={onClose} icon="Check">
          Concluir
        </Button>
      }
    >
      <div className="skp-search">
        <Icon name="Search" size={17} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar skill pelo nome" aria-label="Buscar skill" autoFocus />
      </div>
      <p className="muted small">
        As skills vêm dos cursos publicados. Quando a equipe cadastra uma skill nova em um curso, ela aparece aqui. Suas escolhas são salvas a cada toque.
      </p>
      <div className="skp-groups">
        {Object.entries(groups).map(([category, list]) => (
          <div key={category} className="skp-group">
            <p className="eyebrow">{category}</p>
            <div className="skp-chips">
              {list.map((skill) => (
                <SkillChip key={skill.name} name={skill.name} on={isChosen(skill.name)} onToggle={() => a.toggleGoalSkill(skill.name)} />
              ))}
            </div>
          </div>
        ))}
        {withoutCourse.length > 0 && (
          <div className="skp-group">
            <p className="eyebrow">Escolhidas, sem curso publicado agora</p>
            <div className="skp-chips">
              {withoutCourse.map((name) => (
                <SkillChip key={name} name={name} on missing onToggle={() => a.toggleGoalSkill(name)} />
              ))}
            </div>
          </div>
        )}
        {soon.length > 0 && (
          <div className="skp-group">
            <p className="eyebrow">Skills da Folyo · cursos em breve</p>
            <div className="skp-chips">
              {soon.map((name) => (
                <SkillChip key={name} name={name} on={false} missing onToggle={() => a.toggleGoalSkill(name)} />
              ))}
            </div>
          </div>
        )}
        {!found.length && !withoutCourse.length && !soon.length && <p className="muted">Nenhuma skill encontrada para &quot;{query}&quot;.</p>}
      </div>
    </Modal>
  )
}

/** 3. Quais cursos podem me ajudar? */
function Recommended() {
  const { s, d, catalog } = useApp()
  const router = useRouter()
  const recs = recommendCourses(s, d, catalog)
  return (
    <section className="goal-sec rise" style={{ '--i': 3 } as CSSProperties} aria-labelledby="h-rec">
      <header className="goal-sec-head">
        <div>
          <div className="obj-q dark">
            <span>3</span>Quais cursos podem me ajudar?
          </div>
          <h2 id="h-rec" className="h-sec">
            Cursos recomendados
          </h2>
        </div>
      </header>
      <p className="muted small rec-how">
        <Icon name="Info" size={14} />
        Cursos que ensinam as skills selecionadas, primeiro os que cobrem mais delas. Cursos concluídos não entram.
      </p>
      {s.goals.skills.length ? (
        recs.length ? (
          <ul className="rec-list">
            {recs.slice(0, 6).map(({ course, matched, textHit, started }) => {
              const stats = d.courseStats[course.id]
              return (
                <li key={course.id}>
                  <button type="button" onClick={() => router.push('/cursos/' + course.id)}>
                    <CourseArt course={course} variant="thumb" ratio="1 / 1" className="rec-art" />
                    <span className="rec-body">
                      <b>{course.title}</b>
                      <small className="rec-meta">
                        {started ? `Em andamento · ${stats.pct}%` : `${course.hours} h · ${categoryOf(catalog, course.cat).name}`}
                        {textHit ? ' · combina com o seu objetivo' : ''}
                      </small>
                      <span className="rec-skills">
                        <em>Desenvolve</em>
                        {matched.map((name) => (
                          <i key={name}>{name}</i>
                        ))}
                      </span>
                    </span>
                    <Icon name="ArrowRight" size={16} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rec-empty">
            <Icon name="SearchX" size={18} />
            {d.completedCourses.length
              ? 'Você já concluiu os cursos do catálogo que ensinam essas skills, ou nenhum curso publicado ensina essas skills ainda.'
              : 'Nenhum curso publicado ensina essas skills ainda.'}
          </div>
        )
      ) : (
        <div className="rec-empty">
          <Icon name="MousePointerClick" size={18} />
          Selecione as skills que você quer desenvolver para ver recomendações.
        </div>
      )}
    </section>
  )
}

/** Escolher objetivos: trilhas prontas (objetivo + skills + pacote de cursos). */
function Trails({ skills }: { skills: CatalogSkill[] }) {
  const { s, a, toast, catalog } = useApp()
  const router = useRouter()
  const [pick, setPick] = useState<string | null>(null)
  const [mode, setMode] = useState<'somar' | 'substituir'>('somar')
  const trails = chooseableTrails(catalog.trails).map((t) => trailWithCourses(t, catalog, skills)!).filter((t) => t.liveCourses.length)
  const selected = pick ? (trails.find((t) => t.id === pick) ?? null) : null
  const mine = s.goals.skills
  const incoming = selected ? selected.skills.filter((k) => !mine.some((m) => sameText(m, k))) : []
  const leaving = selected ? mine.filter((m) => !selected.skills.some((k) => sameText(k, m))) : []

  const apply = () => {
    if (!selected) return
    a.applyTrail(selected.id, mode)
    toast(`Trilha aplicada: ${selected.title}.`, 'ok')
    setPick(null)
    document.getElementById('main')?.scrollTo({ top: 0, behavior: 'smooth' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className="trails" aria-labelledby="h-trails">
      <header className="section-head">
        <div>
          <h2 id="h-trails" className="h-sec">
            Escolher objetivos
          </h2>
          <p className="muted">Trilhas profissionais prontas: um objetivo, as skills que ele pede e um pacote de cursos do catálogo.</p>
        </div>
      </header>
      <div className="trail-grid">
        {trails.map((trail, i) => {
          const current = s.goals.primary === trail.id
          const hits = trail.liveSkills.filter((k) => mine.some((m) => sameText(m, k))).length
          return (
            <article key={trail.id} className={'trail-card rise' + (current ? ' current' : '')} style={{ '--i': i } as CSSProperties}>
              <header>
                <span className="trail-ico">
                  <Icon name={trail.icon} size={20} />
                </span>
                <div>
                  <h3>{trail.title}</h3>
                  <p>{trail.blurb}</p>
                </div>
                {current && <span className="trail-badge">Trilha atual</span>}
              </header>
              <div>
                <p className="trail-k">
                  Skills da trilha{' '}
                  <span>
                    {hits}/{trail.liveSkills.length} no seu objetivo
                  </span>
                </p>
                <div className="trail-skills">
                  {trail.liveSkills.map((k) => (
                    <span key={k} className={mine.some((m) => sameText(m, k)) ? 'on' : ''}>
                      {k}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="trail-k">
                  Pacote de cursos{' '}
                  <span>
                    {plural(trail.liveCourses.length, 'curso', 'cursos')} · {trail.liveCourses.reduce((sum, c) => sum + (+c.hours || 0), 0)} h
                  </span>
                </p>
                <ul className="trail-courses">
                  {trail.liveCourses.map((course) => (
                    <li key={course.id}>
                      <button type="button" onClick={() => router.push('/cursos/' + course.id)}>
                        <CourseArt course={course} variant="thumb" ratio="1 / 1" className="trail-art" />
                        <span>{course.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <footer>
                <Button
                  size="sm"
                  variant={current ? 'quiet' : 'primary'}
                  icon={current ? 'RefreshCw' : 'Target'}
                  onClick={() => {
                    setMode('somar')
                    setPick(trail.id)
                  }}
                >
                  {current ? 'Aplicar de novo' : 'Aplicar esta trilha'}
                </Button>
              </footer>
            </article>
          )
        })}
      </div>
      {!trails.length &&
        (catalog.courses.length ? (
          <EmptyState icon="Compass" title="Nenhuma trilha disponível ainda">
            As trilhas aparecem quando há cursos publicados que desenvolvem as skills delas.
          </EmptyState>
        ) : (
          <SoonBlock compact title="As trilhas de cursos chegam em breve." />
        ))}

      <Modal
        open={!!selected}
        onClose={() => setPick(null)}
        title={selected ? selected.title : ''}
        eyebrow="Aplicar trilha"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPick(null)}>
              Cancelar
            </Button>
            <Button icon="Check" onClick={apply}>
              Aplicar trilha
            </Button>
          </>
        }
      >
        {selected && (
          <div className="stack">
            <div className="apply-row">
              <p className="eyebrow">Objetivo principal</p>
              {(s.goals.text || '').trim() && s.goals.text.trim() !== selected.title ? (
                <p className="apply-change">
                  <s>{s.goals.text}</s>
                  <Icon name="ArrowRight" size={14} />
                  <b>{selected.title}</b>
                </p>
              ) : (
                <p className="apply-change">
                  <b>{selected.title}</b>
                </p>
              )}
              <small className="muted">Você pode reescrever o objetivo com as suas palavras depois.</small>
            </div>
            <div className="apply-row">
              <p className="eyebrow">Skills</p>
              <div className="apply-modes" role="radiogroup" aria-label="Como aplicar as skills">
                <label className={mode === 'somar' ? 'on' : ''}>
                  <input type="radio" name="apply-mode" checked={mode === 'somar'} onChange={() => setMode('somar')} />
                  <span>
                    <b>Somar às minhas skills</b>
                    <small>
                      {incoming.length
                        ? `Entram ${plural(incoming.length, 'skill nova', 'skills novas')}: ${incoming.join(', ')}.`
                        : 'Você já tem todas as skills desta trilha.'}{' '}
                      As atuais continuam.
                    </small>
                  </span>
                </label>
                <label className={mode === 'substituir' ? 'on' : ''}>
                  <input type="radio" name="apply-mode" checked={mode === 'substituir'} onChange={() => setMode('substituir')} />
                  <span>
                    <b>Substituir pelas da trilha</b>
                    <small>
                      {leaving.length ? `Saem ${plural(leaving.length, 'skill', 'skills')}: ${leaving.join(', ')}.` : 'Nenhuma skill atual sai.'} Ficam as {selected.skills.length} da trilha.
                    </small>
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
