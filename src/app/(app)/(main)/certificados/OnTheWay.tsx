'use client'

import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { CourseArt, lessonNumber } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Progress, Ring } from '@/components/ui/indicators'
import { issuesCertificate, offersProject, recommendCourses } from '@/lib/domain/derive'
import { plural } from '@/lib/format'
import type { Course, CourseStats } from '@/lib/types'

type State = 'quase' | 'projeto' | 'andamento' | 'novo'

const STATES: Record<State, { label: string; icon: IconName; tone: string }> = {
  quase: { label: 'Quase lá', icon: 'Flag', tone: 'lime' },
  projeto: { label: 'Falta o projeto', icon: 'FolderKanban', tone: 'magenta' },
  andamento: { label: 'Em andamento', icon: 'CircleDot', tone: 'blue' },
  novo: { label: 'Ainda não iniciado', icon: 'Circle', tone: 'muted' },
}
const ORDER: State[] = ['quase', 'projeto', 'andamento']

/** Cursos que dão certificado e pedem projeto (os únicos que aparecem em "A caminho"). */
const countsForCertificate = (c: Course) => offersProject(c) && issuesCertificate(c)

type Item = { course: Course; st: CourseStats; state: State }

function Card({ course, st, state, i }: Item & { i: number }) {
  const { s } = useApp()
  const router = useRouter()
  const info = STATES[state]
  const left = st.total - st.done
  const materials = s.works.filter((w) => w.courseId === course.id).length
  const action =
    state === 'novo'
      ? { label: 'Conhecer o curso', icon: 'ArrowRight' as IconName, run: () => router.push('/cursos/' + course.id) }
      : left > 0
        ? {
            label: `Continuar · aula ${lessonNumber(course, st.resume.id)}`,
            icon: 'Play' as IconName,
            run: () => router.push(`/aula/${course.id}/${st.resume.id}`),
          }
        : { label: 'Enviar o projeto', icon: 'FileUp' as IconName, run: () => router.push('/projetos') }

  return (
    <li className={'otw-card st-' + info.tone} style={{ '--i': i } as CSSProperties}>
      <div className="otw-top">
        <CourseArt course={course} variant="thumb" ratio="1 / 1" className="otw-art" />
        <div className="otw-title">
          <span className={'otw-st st-' + info.tone}>
            <Icon name={info.icon} size={13} />
            {info.label}
          </span>
          <h3>{course.title}</h3>
        </div>
        <Ring value={st.pct} size={54} stroke={5} track="var(--ring-track-dark)" label={`${st.pct}% das aulas`}>
          <b className="ring-sm">{st.pct}%</b>
        </Ring>
      </div>
      <ul className="otw-req">
        <li className={st.complete ? 'ok' : ''}>
          <Icon name={st.complete ? 'CircleCheck' : 'Circle'} size={15} />
          <span>Aulas</span>
          <div className="otw-bar">
            <Progress value={st.pct} size="sm" label={`Aulas de ${course.title}`} />
          </div>
          <small>
            {st.complete ? 'todas concluídas' : state === 'novo' ? plural(st.total, 'aula', 'aulas') : `faltam ${plural(left, 'aula', 'aulas')}`}
          </small>
        </li>
        <li className={st.delivered ? 'ok' : ''}>
          <Icon name={st.delivered ? 'CircleCheck' : 'Circle'} size={15} />
          <span>Projeto</span>
          <small className="otw-proj">
            {st.delivered ? `enviado · ${materials === 1 ? '1 material' : materials + ' materiais'}` : 'ainda não enviado (PDF ou link)'}
          </small>
        </li>
      </ul>
      <button type="button" className="otw-go" onClick={action.run}>
        <Icon name={action.icon} size={15} />
        <span>{action.label}</span>
        <Icon name="ArrowRight" size={15} />
      </button>
    </li>
  )
}

/** "A caminho": certificados que a pessoa ainda pode conquistar. */
export function OnTheWay() {
  const { s, d, catalog } = useApp()

  const going: Item[] = [...d.inProgress, ...d.completedCourses.filter((c) => !d.courseStats[c.id].certified)]
    .filter(countsForCertificate)
    .map((course) => {
      const st = d.courseStats[course.id]
      const left = st.total - st.done
      const state: State = st.complete ? 'projeto' : left <= 3 || st.pct >= 75 ? 'quase' : 'andamento'
      return { course, st, state }
    })
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || b.st.pct - a.st.pct)

  // Para começar: cursos que combinam com as skills escolhidas ou estão nos favoritos.
  const fresh: Item[] = [
    ...recommendCourses(s, d, catalog).map((r) => r.course),
    ...s.favorites.map((id) => catalog.courses.find((c) => c.id === id)).filter((c): c is Course => !!c),
  ]
    .filter((c, i, all) => all.indexOf(c) === i && !d.courseStats[c.id].started && countsForCertificate(c))
    .slice(0, 3)
    .map((course) => ({ course, st: d.courseStats[course.id], state: 'novo' as const }))

  if (!going.length && !fresh.length) return null
  const count = (state: State) => going.filter((g) => g.state === state).length

  return (
    <section className="otw rise" aria-labelledby="h-otw">
      <header className="otw-head">
        <div>
          <h2 id="h-otw" className="h-sec">
            A caminho
          </h2>
          <p className="muted-on-dark">
            Certificados que você pode conquistar. Cada um pede todas as aulas do curso e o projeto enviado em PDF ou link.
          </p>
        </div>
        {going.length > 0 && (
          <ul className="otw-legend">
            {ORDER.filter(count).map((state) => (
              <li key={state} className={'otw-st st-' + STATES[state].tone}>
                <Icon name={STATES[state].icon} size={13} />
                {STATES[state].label}
                <b>{count(state)}</b>
              </li>
            ))}
          </ul>
        )}
      </header>
      {going.length > 0 && (
        <ul className="otw-grid">
          {going.map((g, i) => (
            <Card key={g.course.id} {...g} i={i} />
          ))}
        </ul>
      )}
      {fresh.length > 0 && (
        <>
          <p className="eyebrow otw-sub">Para começar · combinam com as suas skills ou estão nos favoritos</p>
          <ul className="otw-grid otw-fresh">
            {fresh.map((g, i) => (
              <Card key={g.course.id} {...g} i={i} />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
