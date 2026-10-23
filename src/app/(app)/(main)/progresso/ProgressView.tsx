'use client'

import Link from 'next/link'
import { useMemo, useState, type CSSProperties } from 'react'
import { SkillBubbles } from '@/components/dashboard/SkillBubbles'
import { StatTiles } from '@/components/dashboard/StatTiles'
import { StudyChart } from '@/components/dashboard/StudyChart'
import { useApp } from '@/components/providers/AppState'
import { Seg } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { formatDate } from '@/lib/format'
import type { Derived, UserState } from '@/lib/types'

type EventKind = 'marco' | 'curso' | 'projeto' | 'certificado' | 'competencia'
type TimelineEvent = { date: string; kind: EventKind; icon: IconName; title: string; to: string; strong?: boolean }

/** Tudo que a pessoa fez na Folyo, do mais recente para o mais antigo. */
function timeline(state: UserState, d: Derived, courses: { id: string; title: string }[]): TimelineEvent[] {
  const ev: TimelineEvent[] = [{ date: state.user.joined, kind: 'marco', icon: 'Flag', title: 'Entrou na Folyo', to: '/perfil' }]
  for (const c of courses) {
    const st = d.courseStats[c.id]
    if (st.startedAt) ev.push({ date: st.startedAt, kind: 'curso', icon: 'Play', title: `Começou ${c.title}`, to: '/cursos/' + c.id })
    if (st.completedAt)
      ev.push({ date: st.completedAt, kind: 'curso', icon: 'BookOpen', title: `Concluiu as aulas de ${c.title}`, to: '/cursos/' + c.id })
  }
  for (const cert of d.certificates)
    ev.push({
      date: cert.date,
      kind: 'certificado',
      icon: 'Award',
      title: `Certificado: ${cert.course.title}`,
      to: '/certificados',
      strong: true,
    })
  const byDay: Record<string, string[]> = {}
  for (const k of state.skills) if (k.createdAt > state.user.joined) (byDay[k.createdAt] ||= []).push(k.name)
  Object.entries(byDay).forEach(([date, names]) =>
    ev.push({
      date,
      kind: 'competencia',
      icon: 'Puzzle',
      title: `Registrou ${names.length === 1 ? 'a competência' : 'as competências'} ${names.join(', ')}`,
      to: '/curriculo',
    }),
  )
  for (const w of d.works)
    ev.push({
      date: w.createdAt.slice(0, 10),
      kind: 'projeto',
      icon: w.kind === 'pdf' ? 'FileText' : 'Link',
      title: w.course ? `Enviou "${w.title}" no projeto de ${w.course.title}` : `Adicionou "${w.title}" aos trabalhos fora da Folyo`,
      to: '/projetos',
    })
  return ev.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function ProgressView() {
  const { s, d, catalog } = useApp()
  const [filter, setFilter] = useState<'todos' | EventKind>('todos')
  const events = useMemo(() => timeline(s, d, catalog.courses), [s, d, catalog.courses])
  const started = catalog.courses
    .filter((c) => d.courseStats[c.id].started)
    .sort((a, b) => Number(d.courseStats[a.id].complete) - Number(d.courseStats[b.id].complete) || d.courseStats[b.id].pct - d.courseStats[a.id].pct)
  const shown = events.filter((e) => filter === 'todos' || e.kind === filter)

  return (
    <div className="page surface-ink progress-page">
      <header className="pagehead rise">
        <p className="eyebrow">Aprenda</p>
        <h1>Meu progresso</h1>
        <p className="lead">Sua evolução desde {formatDate(s.user.joined, true)}, quando você entrou na Folyo.</p>
      </header>

      <section className="rise" style={{ '--i': 1 } as CSSProperties} aria-label="Indicadores">
        <StatTiles keys={['horas', 'concluidos', 'iniciados', 'aulas', 'certificados', 'projetos']} variant="row" />
      </section>

      <div className="prog-grid">
        <div className="span-3 rise" style={{ '--i': 2 } as CSSProperties}>
          <StudyChart />
        </div>

        <section className="panel-dark span-3 rise prog-where" style={{ '--i': 3 } as CSSProperties}>
          <header className="panel-head">
            <div>
              <h2>Onde você está em cada curso</h2>
              <p className="muted-on-dark">Aulas concluídas sobre o total e como elas se distribuem entre as skills.</p>
            </div>
          </header>
          <div className="where-grid">
            <div>
              <p className="eyebrow">Por curso</p>
              {started.length ? (
                <ul className="course-bars">
                  {started.map((c) => {
                    const st = d.courseStats[c.id]
                    return (
                      <li key={c.id}>
                        <Link href={'/cursos/' + c.id} className="cb-name">
                          {c.title}
                        </Link>
                        <div className="cb-track">
                          <span style={{ width: st.pct + '%' }} className={st.complete ? 'done' : ''} />
                        </div>
                        <span className="cb-val">
                          {st.done}/{st.total}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : catalog.courses.length ? (
                <p className="muted-on-dark">
                  Você ainda não começou um curso. <Link href="/cursos">Explorar cursos</Link>
                </p>
              ) : (
                <p className="muted-on-dark">
                  Seus próximos aprendizados começam aqui. Em breve, novos cursos para transformar conhecimento em projetos reais.
                </p>
              )}
            </div>
            <div>
              <p className="eyebrow">Por skill</p>
              <SkillBubbles compact />
            </div>
          </div>
        </section>

        <section className="panel-dark span-3 rise" style={{ '--i': 4 } as CSSProperties}>
          <header className="panel-head">
            <h2>Linha do tempo</h2>
            <Seg
              label="Filtrar linha do tempo"
              size="sm"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'todos', label: 'Tudo' },
                { value: 'curso', label: 'Cursos' },
                { value: 'projeto', label: 'Projetos' },
                { value: 'certificado', label: 'Certificados' },
                { value: 'competencia', label: 'Competências' },
              ]}
            />
          </header>
          <ol className="timeline">
            {shown.map((e, i) => (
              <li key={e.title + e.date + i} className={e.strong ? 'strong' : ''} style={{ '--i': Math.min(i, 8) } as CSSProperties}>
                <time dateTime={e.date}>{formatDate(e.date)}</time>
                <span className="tl-dot">
                  <Icon name={e.icon} size={14} />
                </span>
                <Link href={e.to}>{e.title}</Link>
              </li>
            ))}
            {!shown.length && <li className="muted-on-dark">Nada registrado nesta categoria ainda.</li>}
          </ol>
        </section>
      </div>
    </div>
  )
}
