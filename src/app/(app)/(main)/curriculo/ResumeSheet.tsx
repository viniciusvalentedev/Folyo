'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { findCourse } from '@/lib/domain/catalog'
import { formatDate, formatPhoneBR } from '@/lib/format'
import type { Catalog, Derived, ResumeSection, SkillType, UserState } from '@/lib/types'

export const SECTION_NAMES: Record<ResumeSection, string> = {
  objetivo: 'Objetivo profissional',
  formacao: 'Formação',
  experiencia: 'Experiências',
  projetos: 'Projetos',
  cursos: 'Cursos e certificados',
  competencias: 'Competências',
  idiomas: 'Idiomas',
  conquistas: 'Conquistas e atividades',
}

export const EXPERIENCE_KINDS: Record<string, string> = {
  profissional: 'Profissional',
  extracurricular: 'Extracurricular',
  voluntario: 'Voluntariado',
}

export const SKILL_GROUPS: Record<SkillType, string> = {
  tecnica: 'Técnicas',
  ferramenta: 'Ferramentas',
  comportamental: 'Comportamentais',
  idioma: 'Idiomas',
}

function hostOf(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

/** Junta os dados que entram no currículo (só o que está marcado como "incluído"). */
export function resumeData(s: UserState, d: Derived, catalog: Catalog) {
  const u = s.user
  // Trabalhos enviados (PDF ou link) marcados para o currículo.
  const projects = d.works
    .filter((w) => w.inCV)
    .map((w) => ({
      id: w.id,
      title: w.title,
      problem: w.desc,
      completedAt: w.createdAt.slice(0, 10),
      skills: [
        w.course ? 'Projeto do curso ' + w.course.title : 'Projeto fora da Folyo',
        w.kind === 'pdf' ? 'PDF' : hostOf(w.url),
      ].filter(Boolean),
    }))
  const courses = s.resume.certs
    .map((id) => findCourse(catalog, id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map((c) => {
      const st = d.courseStats[c.id]
      return {
        title: c.title,
        detail: st.certified
          ? `Folyo · certificado de conclusão, ${formatDate(st.certDate)}`
          : st.complete
            ? 'Folyo · aulas concluídas'
            : `Folyo · em andamento (${st.pct}%)`,
      }
    })
  const skills = d.skills.filter((k) => k.inCV && k.type !== 'idioma')
  const order = s.resume.order.filter((sec) => !s.resume.hidden.includes(sec))
  return { u, projects, courses, skills, order }
}

/** Versão em texto puro (para "Copiar texto"). */
export function resumeText(s: UserState, d: Derived, catalog: Catalog) {
  const r = resumeData(s, d, catalog)
  const lines = [r.u.name, [r.u.city, r.u.email, formatPhoneBR(r.u.phone), r.u.link].filter(Boolean).join(' | '), '']
  for (const sec of r.order) {
    const items: string[] = []
    if (sec === 'objetivo' && r.u.objective) items.push(r.u.objective)
    if (sec === 'formacao') r.u.education.forEach((e) => items.push(`${e.course} · ${e.inst} · ${e.period}`))
    if (sec === 'experiencia')
      r.u.experiences.forEach((x) => items.push(`${x.role} · ${x.org} (${x.period})${x.desc ? `\n  ${x.desc}` : ''}`))
    if (sec === 'projetos') r.projects.forEach((p) => items.push(`${p.title}${p.problem ? `\n  ${p.problem}` : ''}\n  ${p.skills.join(' · ')}`))
    if (sec === 'cursos') r.courses.forEach((c) => items.push(`${c.title} · ${c.detail}`))
    if (sec === 'competencias' && r.skills.length) items.push(r.skills.map((k) => k.name).join(', '))
    if (sec === 'idiomas') r.u.languages.forEach((l) => items.push(`${l.name}: ${l.level}`))
    if (sec === 'conquistas') r.u.achievements.forEach((a) => items.push(a.text))
    if (items.length) lines.push(SECTION_NAMES[sec].toUpperCase(), ...items, '')
  }
  return lines.join('\n')
}

/** Encolhe a folha A4 (794 px) para caber na coluna da pré-visualização. */
export function Scaled({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.7)
  const [height, setHeight] = useState(1123)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      const k = Math.min(1, el.clientWidth / 794)
      setScale(k)
      const inner = el.firstElementChild as HTMLElement | null
      if (inner) setHeight(inner.scrollHeight * k)
    })
    obs.observe(el)
    if (el.firstElementChild) obs.observe(el.firstElementChild)
    return () => obs.disconnect()
  }, [])
  return (
    <div className="scaled" ref={box} style={{ height }}>
      <div className="scaled-in" style={{ transform: `scale(${scale})` }}>
        {children}
      </div>
    </div>
  )
}

/** A folha do currículo (modelos Clássico e Moderno). */
export function ResumeSheet({ s, d, catalog }: { s: UserState; d: Derived; catalog: Catalog }) {
  const r = resumeData(s, d, catalog)
  const template = s.resume.template
  const contact = [r.u.city, r.u.email, formatPhoneBR(r.u.phone), r.u.link].filter(Boolean)
  const groups: SkillType[] = ['tecnica', 'ferramenta', 'comportamental']

  const blocks: Record<ResumeSection, ReactNode> = {
    objetivo: r.u.objective && <p className="cv-p">{r.u.objective}</p>,
    formacao:
      r.u.education.length > 0 &&
      r.u.education.map((e) => (
        <div key={e.id} className="cv-item">
          <div className="cv-line">
            <b>{e.course}</b>
            <span>{e.period}</span>
          </div>
          <p>{e.inst}</p>
        </div>
      )),
    experiencia:
      r.u.experiences.length > 0 &&
      r.u.experiences.map((x) => (
        <div key={x.id} className="cv-item">
          <div className="cv-line">
            <b>{x.role}</b>
            <span>{x.period}</span>
          </div>
          <p className="cv-org">
            {x.org}
            {x.kind !== 'profissional' ? ` · ${EXPERIENCE_KINDS[x.kind] ?? x.kind}` : ''}
          </p>
          {x.desc && <p>{x.desc}</p>}
        </div>
      )),
    projetos:
      r.projects.length > 0 &&
      r.projects.map((p) => (
        <div key={p.id} className="cv-item cv-flash">
          <div className="cv-line">
            <b>{p.title}</b>
            <span>{p.completedAt ? formatDate(p.completedAt).replace(/^\d+ /, '') : ''}</span>
          </div>
          <p>{p.problem}</p>
          <p className="cv-tags">{p.skills.join(' · ')}</p>
        </div>
      )),
    cursos:
      r.courses.length > 0 &&
      r.courses.map((c) => (
        <div key={c.title} className="cv-item tight">
          <div className="cv-line">
            <b>{c.title}</b>
          </div>
          <p>{c.detail}</p>
        </div>
      )),
    competencias:
      r.skills.length > 0 &&
      (template === 'moderno' ? null : (
        <p className="cv-p">
          {groups.map((g) => {
            const list = r.skills.filter((k) => k.type === g)
            return list.length ? (
              <span key={g} className="cv-skillrow">
                <b>{SKILL_GROUPS[g]}:</b> {list.map((k) => k.name).join(', ')}
              </span>
            ) : null
          })}
        </p>
      )),
    idiomas:
      r.u.languages.length > 0 &&
      (template === 'moderno' ? null : (
        <p className="cv-p">{r.u.languages.map((l) => `${l.name} (${l.level})`).join(' · ')}</p>
      )),
    conquistas:
      r.u.achievements.length > 0 && (
        <ul className="cv-ul">
          {r.u.achievements.map((a) => (
            <li key={a.id}>{a.text}</li>
          ))}
        </ul>
      ),
  }

  const mainOrder = template === 'moderno' ? r.order.filter((x) => x !== 'competencias' && x !== 'idiomas') : r.order

  return (
    <article className={'cv cv-' + template}>
      {template === 'moderno' && (
        <aside className="cv-side">
          <h1>{r.u.name}</h1>
          <p className="cv-headline">{r.u.headline}</p>
          <div className="cv-side-sec">
            <h3>Contato</h3>
            {contact.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
          {r.order.includes('competencias') && r.skills.length > 0 && (
            <div className="cv-side-sec">
              <h3>Competências</h3>
              {groups.map((g) => {
                const list = r.skills.filter((k) => k.type === g)
                return list.length ? (
                  <div key={g} className="cv-side-group">
                    <h4>{SKILL_GROUPS[g]}</h4>
                    {list.map((k) => (
                      <p key={k.id}>{k.name}</p>
                    ))}
                  </div>
                ) : null
              })}
            </div>
          )}
          {r.order.includes('idiomas') && r.u.languages.length > 0 && (
            <div className="cv-side-sec">
              <h3>Idiomas</h3>
              {r.u.languages.map((l) => (
                <p key={l.id}>
                  {l.name}
                  <br />
                  <small>{l.level}</small>
                </p>
              ))}
            </div>
          )}
        </aside>
      )}
      <div className="cv-main">
        {template === 'classico' && (
          <header className="cv-head">
            <h1>{r.u.name}</h1>
            <p className="cv-headline">{r.u.headline}</p>
            <p className="cv-contact">{contact.join('  ·  ')}</p>
          </header>
        )}
        {mainOrder.map((sec) =>
          blocks[sec] ? (
            <section key={sec} className="cv-sec">
              <h2>{SECTION_NAMES[sec]}</h2>
              {blocks[sec]}
            </section>
          ) : null,
        )}
      </div>
    </article>
  )
}
