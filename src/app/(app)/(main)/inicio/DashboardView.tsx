'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, type CSSProperties } from 'react'
import { CourseCard } from '@/components/course/CourseBits'
import { ProjectCard } from '@/components/project/ProjectCard'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { CountUp } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { findCourse } from '@/lib/domain/catalog'
import { formatWeekdayLong, plural } from '@/lib/format'
import type { Catalog, Derived, UserState } from '@/lib/types'
import { useNow } from '@/lib/use-now'

type Stage = 'Aprenda' | 'Pratique' | 'Demonstre'
/** Na tela inicial os estágios aparecem como Aprenda / Crie / Conquiste. */
const STAGE_LABEL: Record<Stage, string> = { Aprenda: 'Aprenda', Pratique: 'Crie', Demonstre: 'Conquiste' }

type NextStep = {
  stage: Stage
  icon: IconName
  title: string
  meta: string
  cta: string
  to?: string
  action?: 'cv' | 'skills'
  id?: string
}

/** Sugestões de "próximos passos" a partir do que o aluno já fez. */
function nextSteps(s: UserState, d: Derived, catalog: Catalog): NextStep[] {
  const out: NextStep[] = []
  const current = d.inProgress[0]
  if (current) {
    const st = d.courseStats[current.id]
    const lesson = st.nextLesson || st.resume
    out.push({
      stage: 'Aprenda',
      icon: 'Play',
      title: `Concluir a aula "${lesson.title}"`,
      meta: `${current.title} · ${lesson.min} min`,
      to: `/aula/${current.id}/${lesson.id}`,
      cta: 'Abrir aula',
    })
  }
  s.projects
    .filter((p) => p.status === 'andamento')
    .slice(0, 1)
    .forEach((p) => {
      const done = p.steps.filter((x) => x.done).length
      out.push({
        stage: 'Pratique',
        icon: 'FolderKanban',
        title: `Finalizar ${p.title}`,
        meta: `${done} de ${p.steps.length} etapas concluídas`,
        to: '/projetos/' + p.id,
        cta: 'Continuar projeto',
      })
    })
  d.projectsDone
    .filter((p) => !s.resume.projects.includes(p.id))
    .slice(0, 1)
    .forEach((p) => {
      out.push({
        stage: 'Demonstre',
        icon: 'FileText',
        title: `Adicionar "${p.title}" ao currículo`,
        meta: 'Projeto concluído que ainda não aparece no currículo',
        action: 'cv',
        id: p.id,
        cta: 'Adicionar',
      })
    })
  if (d.unregisteredCourseSkills.length) {
    out.push({
      stage: 'Demonstre',
      icon: 'Puzzle',
      title: `Registrar ${plural(d.unregisteredCourseSkills.length, 'competência', 'competências')} dos cursos concluídos`,
      meta: d.unregisteredCourseSkills.join(', '),
      action: 'skills',
      cta: 'Registrar',
    })
  }
  s.projects
    .filter((p) => p.status === 'revisao')
    .slice(0, 1)
    .forEach((p) => {
      out.push({
        stage: 'Pratique',
        icon: 'CircleAlert',
        title: `Revisar ${p.title}`,
        meta: 'Falta descrever o resultado do projeto',
        to: '/projetos/' + p.id,
        cta: 'Revisar',
      })
    })
  if (d.goal) {
    const next = d.goal.courses
      .map((id) => findCourse(catalog, id))
      .find((c) => c && !d.courseStats[c.id].started)
    if (next) {
      out.push({
        stage: 'Aprenda',
        icon: 'Compass',
        title: `Começar ${next.title}`,
        meta: `Recomendado para "${d.goal.title}"`,
        to: '/cursos/' + next.id,
        cta: 'Ver curso',
      })
    }
  }
  if (!s.user.education.length) {
    out.push({
      stage: 'Demonstre',
      icon: 'GraduationCap',
      title: 'Adicionar sua formação ao currículo',
      meta: 'Escola, faculdade ou curso técnico, mesmo em andamento',
      to: '/curriculo',
      cta: 'Adicionar',
    })
  }
  if (!s.user.languages.some((l) => /ingl/i.test(l.name))) {
    out.push({
      stage: 'Demonstre',
      icon: 'Languages',
      title: 'Informar seu nível de inglês no currículo',
      meta: d.courseStats.ingles?.started
        ? 'O curso de inglês está em andamento'
        : 'Muitas vagas pedem essa informação, mesmo que o nível seja básico',
      to: '/curriculo',
      cta: 'Informar',
    })
  }
  return out
}

/** "Boa noite, Ana." + data de hoje. Depende do relógio do aluno. */
function Greeting({ first }: { first: string }) {
  const now = useNow()
  const h = now.getHours()
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  return (
    <>
      <p className="eyebrow cap">{formatWeekdayLong(now)}</p>
      <h1 className="display">
        {hello}, {first}.
      </h1>
    </>
  )
}

function GreetingFallback({ first }: { first: string }) {
  return (
    <>
      <p className="eyebrow cap">&nbsp;</p>
      <h1 className="display">Olá, {first}.</h1>
    </>
  )
}

export function DashboardView() {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const current = d.inProgress[0]
  const cs = current ? d.courseStats[current.id] : null
  const left = cs ? cs.total - cs.done : 0
  const steps = nextSteps(s, d, catalog).slice(0, 5)
  const order = { andamento: 0, revisao: 1, concluido: 2 }
  const projects = [...s.projects].sort((x, y) => order[x.status] - order[y.status]).slice(0, 3)
  const certsInCV = d.certificates.filter((c) => c.inCV).length
  const startHere =
    d.lessonsDone === 0 && d.goal
      ? d.goal.courses
          .map((id) => findCourse(catalog, id))
          .filter((c): c is NonNullable<typeof c> => !!c && !d.courseStats[c.id].started)
          .slice(0, 3)
      : []

  const run = (step: NextStep) => {
    if (step.action === 'cv' && step.id) {
      a.toggleProjectCV(step.id, true)
      toast('Projeto adicionado ao currículo.', 'ok', {
        actionLabel: 'Ver currículo',
        onAction: () => router.push('/curriculo'),
      })
    } else if (step.action === 'skills') {
      a.registerSkills(d.unregisteredCourseSkills)
      toast(
        `${plural(d.unregisteredCourseSkills.length, 'competência registrada', 'competências registradas')}.`,
        'ok',
        { actionLabel: 'Ver', onAction: () => router.push('/competencias') },
      )
    } else if (step.to) {
      router.push(step.to)
    }
  }

  return (
    <div className="page surface-ink dash">
      <section className="dash-top rise">
        <div>
          <Suspense fallback={<GreetingFallback first={s.user.first} />}>
            <Greeting first={s.user.first} />
          </Suspense>
          <p className="lead">
            {current ? (
              <>
                Faltam <b className="hl">{plural(left, 'aula', 'aulas')}</b> para você concluir {current.title}.
              </>
            ) : d.goal ? (
              <>
                Seu objetivo: <b className="hl">{d.goal.title.toLowerCase()}</b>. Comece pelo curso recomendado abaixo.
              </>
            ) : (
              'Escolha um curso e comece a construir seu primeiro projeto.'
            )}
          </p>
        </div>
        <p className="beta-note" role="note">
          <Icon name="FlaskConical" size={16} />
          <span>
            <b>Fase de testes.</b> Seu progresso, projetos, competências e currículo já ficam salvos na sua conta. Os
            vídeos das aulas e os certificados ainda são demonstrações.
          </span>
        </p>
      </section>

      {startHere.length > 0 && (
        <section className="dash-start rise" style={{ '--i': 1 } as CSSProperties}>
          <header className="section-head">
            <h2>Comece por aqui</h2>
            <Link href="/objetivos" className="link-sm">
              Ver seu objetivo <Icon name="ArrowRight" size={14} />
            </Link>
          </header>
          <div className="grid-3">
            {startHere.map((c, i) => (
              <CourseCard key={c.id} course={c} i={i} />
            ))}
          </div>
        </section>
      )}

      <section className="dash-projects rise" style={{ '--i': 1 } as CSSProperties}>
        <header className="section-head">
          <h2>Projetos</h2>
          {projects.length > 0 && (
            <Link href="/projetos" className="link-sm">
              Ver todos <Icon name="ArrowRight" size={14} />
            </Link>
          )}
        </header>
        {projects.length ? (
          <div className="grid-3">
            {projects.map((p, i) => (
              <ProjectCard key={p.id} p={p} i={i} />
            ))}
          </div>
        ) : (
          <div className="panel dash-empty">
            <EmptyState
              icon="FolderKanban"
              title="Seus projetos vão aparecer aqui"
              action={
                <Button variant="quiet" icon="Plus" onClick={() => router.push('/projetos/novo')}>
                  Registrar um projeto
                </Button>
              }
            >
              Cada curso termina com um projeto prático. Você também pode registrar algo que já fez fora da Folyo.
            </EmptyState>
          </div>
        )}
      </section>

      <section className="panel career rise" style={{ '--i': 2 } as CSSProperties} aria-label="Sua trajetória">
        <header className="panel-head">
          <h2>Sua trajetória</h2>
          <p className="muted">O que você aprendeu, criou e já conquistou.</p>
        </header>
        <div className="apd">
          <Link href="/progresso" className="apd-col">
            <span className="apd-k">Aprenda</span>
            <b>
              <CountUp value={d.lessonsDone} />
            </b>
            <small>
              {d.inProgress.length + d.completedCourses.length ? (
                <>aulas concluídas em {plural(d.inProgress.length + d.completedCourses.length, 'curso', 'cursos')}</>
              ) : (
                'aulas concluídas'
              )}
            </small>
            <span className="apd-sub">
              <b>
                <CountUp value={d.inProgress.length} />
              </b>
              {d.inProgress.length === 1 ? 'curso em andamento' : 'cursos em andamento'}
            </span>
          </Link>
          <Link href="/projetos" className="apd-col">
            <span className="apd-k">Crie</span>
            <b>
              <CountUp value={d.projectsDone.length} />
            </b>
            <small>{d.projectsDone.length === 1 ? 'projeto concluído' : 'projetos concluídos'}</small>
          </Link>
          <Link href="/curriculo" className="apd-col">
            <span className="apd-k">Conquiste</span>
            <b>
              <CountUp value={d.cvProjects.length} />
            </b>
            <small>{d.cvProjects.length === 1 ? 'projeto no currículo' : 'projetos no currículo'}</small>
            <span className="apd-sub">
              <b>
                <CountUp value={certsInCV} />
              </b>
              {certsInCV === 1 ? 'certificado no currículo' : 'certificados no currículo'}
            </span>
          </Link>
        </div>
      </section>

      <section className="panel nextsteps rise" style={{ '--i': 3 } as CSSProperties}>
        <header className="panel-head">
          <h2>Próximos passos</h2>
          <p className="muted">Sugestões a partir do que você já fez.</p>
        </header>
        <ol className="steps-list">
          {steps.map((step, i) => (
            <li key={step.title} className="step-row">
              <span className={'stage stage-' + step.stage.toLowerCase()}>{STAGE_LABEL[step.stage]}</span>
              <div className="step-text">
                <b>{step.title}</b>
                <small>{step.meta}</small>
              </div>
              <Button size="sm" variant={i === 0 ? 'go' : 'quiet'} onClick={() => run(step)}>
                {step.cta}
              </Button>
            </li>
          ))}
          {!steps.length && <li className="muted">Você está em dia. Que tal explorar um curso novo?</li>}
        </ol>
      </section>
    </div>
  )
}
