'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, type CSSProperties } from 'react'
import { CourseCard, CourseProgressCard } from '@/components/course/CourseBits'
import { SkillBubbles } from '@/components/dashboard/SkillBubbles'
import { StatTiles } from '@/components/dashboard/StatTiles'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SoonBlock } from '@/components/ui/SoonBlock'
import { recommendCourses } from '@/lib/domain/derive'
import { formatWeekdayLong, plural } from '@/lib/format'
import { useNow } from '@/lib/use-now'

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
  const { s, d, catalog } = useApp()
  const router = useRouter()
  const current = d.inProgress[0]
  const stats = current ? d.courseStats[current.id] : null
  const left = stats ? stats.total - stats.done : 0
  const goalText = (s.goals.text || '').trim()
  const hasCatalog = catalog.courses.length > 0
  const recommended = d.inProgress.length ? [] : recommendCourses(s, d, catalog).slice(0, 3)

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
            ) : goalText ? (
              <>
                Seu objetivo: <b className="hl">{goalText}</b>.
              </>
            ) : hasCatalog ? (
              'Escolha um curso e comece a construir a sua trajetória.'
            ) : (
              'Sua trajetória na Folyo começa aqui.'
            )}
          </p>
        </div>
      </section>

      <section className="dash-courses rise" style={{ '--i': 1 } as CSSProperties} aria-labelledby="h-andamento">
        <header className="section-head">
          <h2 id="h-andamento">Cursos em andamento</h2>
          {d.inProgress.length > 3 ? (
            <Link href="/progresso" className="link-sm">
              Ver todos ({d.inProgress.length}) <Icon name="ArrowRight" size={14} />
            </Link>
          ) : (
            d.inProgress.length > 0 &&
            hasCatalog && (
              <Link href="/cursos" className="link-sm">
                Explorar cursos <Icon name="ArrowRight" size={14} />
              </Link>
            )
          )}
        </header>
        {!hasCatalog && !d.inProgress.length ? (
          <SoonBlock compact>
            <Button variant="quiet" icon="Target" onClick={() => router.push('/objetivos')}>
              Definir meus objetivos
            </Button>
          </SoonBlock>
        ) : d.inProgress.length > 0 ? (
          <div className="grid-3">
            {d.inProgress.slice(0, 3).map((course, i) => (
              <CourseProgressCard key={course.id} course={course} i={i} />
            ))}
          </div>
        ) : (
          <div className="panel dash-empty-courses">
            <div className="dec-text">
              <span className="dec-ico">
                <Icon name="Compass" size={22} />
              </span>
              <div>
                <h3>Nenhum curso em andamento</h3>
                <p className="muted">
                  {d.completedCourses.length
                    ? 'Você concluiu os cursos que começou. Escolha o próximo para continuar evoluindo.'
                    : 'Escolha um curso e conclua a primeira aula. Ele aparece aqui, com o ponto exato onde você parou.'}
                </p>
              </div>
              <Button variant="go" iconRight="ArrowRight" onClick={() => router.push('/cursos')}>
                Explorar cursos
              </Button>
            </div>
            {recommended.length > 0 && (
              <div className="dec-recs">
                <p className="eyebrow">Combinam com as skills que você escolheu</p>
                <div className="grid-3">
                  {recommended.map((rec, i) => (
                    <CourseCard key={rec.course.id} course={rec.course} i={i} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="dash-skills rise" style={{ '--i': 2 } as CSSProperties} aria-labelledby="h-skills">
        <header className="panel-head">
          <div>
            <h2 id="h-skills">Suas skills</h2>
            <p className="muted">
              Como as aulas que você concluiu se distribuem entre as skills dos cursos. É a sua trajetória de aprendizado até aqui.
            </p>
          </div>
          <Link href="/objetivos" className="link-sm">
            Skills que você quer desenvolver <Icon name="ArrowRight" size={14} />
          </Link>
        </header>
        <SkillBubbles />
      </section>

      <section className="panel career rise" style={{ '--i': 3 } as CSSProperties} aria-labelledby="h-trajetoria">
        <header className="panel-head">
          <div>
            <h2 id="h-trajetoria">Sua trajetória e conquistas</h2>
            <p className="muted">Aprenda. Crie. Conquiste. O que você já construiu na Folyo.</p>
          </div>
        </header>
        <StatTiles keys={['aulas', 'horas', 'projetos', 'certificados']} />
      </section>
    </div>
  )
}
