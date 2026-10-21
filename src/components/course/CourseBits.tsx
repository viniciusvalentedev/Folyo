'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties, ReactNode } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Art, Spark } from '@/components/ui/Art'
import { Icon } from '@/components/ui/Icon'
import { Progress, StatusPill } from '@/components/ui/indicators'
import { categoryOf, courseSeed } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import { siteConfig } from '@/lib/config'
import type { Course } from '@/lib/types'

/** Capa do curso (arte gerada a partir do tom e do glifo do curso). */
export function CourseArt({
  course,
  ratio,
  className,
  big,
  children,
}: {
  course: Course
  ratio?: string
  className?: string
  big?: boolean
  children?: ReactNode
}) {
  const { catalog } = useApp()
  return (
    <Art
      tone={course.tone}
      glyph={course.glyph}
      seed={courseSeed(catalog, course.id)}
      ratio={ratio}
      className={className}
      big={big}
    >
      {children}
    </Art>
  )
}

/** Botão de favoritar (coração). */
export function FavButton({ cid, light }: { cid: string; light?: boolean }) {
  const { s, a, toast } = useApp()
  const on = s.favorites.includes(cid)
  return (
    <button
      type="button"
      className={'fav' + (on ? ' on' : '') + (light ? ' light' : '')}
      aria-pressed={on}
      aria-label={on ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
      onClick={(e) => {
        e.stopPropagation()
        a.toggleFavorite(cid)
        toast(on ? 'Removido dos favoritos.' : 'Salvo nos favoritos.', 'info')
      }}
    >
      <Icon name="Heart" size={16} />
    </button>
  )
}

/** Situação do aluno no curso: concluído, % concluído ou disponível. */
export function CourseStatus({ cid }: { cid: string }) {
  const { d } = useApp()
  const st = d.courseStats[cid]
  if (st.status === 'concluido') return <StatusPill status="concluido" />
  if (st.status === 'iniciado') return <StatusPill status="iniciado">{st.pct}% concluído</StatusPill>
  return <StatusPill status="disponivel" />
}

/** Card de curso usado no catálogo, no início e nos objetivos. */
export function CourseCard({ course, i = 0 }: { course: Course; i?: number }) {
  const { d, catalog } = useApp()
  const router = useRouter()
  const st = d.courseStats[course.id]
  const href = '/cursos/' + course.id
  return (
    <article className="ccard rise" style={{ '--i': i } as CSSProperties} onClick={() => router.push(href)}>
      <div className="ccard-art">
        <CourseArt course={course} ratio="16 / 9" />
        <div className="ccard-top">
          {siteConfig.catalog.showPlanBadge &&
            (course.plan === 'free' ? <span className="plan free">Gratuito</span> : <span className="plan">Pro</span>)}
          <FavButton cid={course.id} />
        </div>
        {st.started && !st.complete && (
          <div className="ccard-prog">
            <Progress value={st.pct} size="sm" label="Progresso no curso" />
          </div>
        )}
      </div>
      <div className="ccard-body">
        <p className="ccard-cat">{categoryOf(catalog, course.cat).name}</p>
        <h3>
          <Link href={href} onClick={(e) => e.stopPropagation()}>
            {course.title}
          </Link>
        </h3>
        <p className="ccard-meta">
          {course.level}
          <b>·</b>
          {course.hours} h<b>·</b>
          {plural(course.modules.length, 'módulo', 'módulos')}
        </p>
        <div className="ccard-make">
          <Spark className="ccard-spark" />
          <span className="ccard-make-k">Você vai produzir</span>
          <span>{course.project.title}</span>
        </div>
        <div className="ccard-foot">
          <div className="chips-mini">
            {course.skills.slice(0, 2).map((s) => (
              <span key={s}>{s}</span>
            ))}
            {course.skills.length > 2 && <span>+{course.skills.length - 2}</span>}
          </div>
          <CourseStatus cid={course.id} />
        </div>
      </div>
    </article>
  )
}

/** Número da aula dentro do curso (1, 2, 3...). */
export function lessonNumber(course: Course, lessonId: string) {
  return course.modules.flatMap((m) => m.lessons).findIndex((l) => l.id === lessonId) + 1
}

/** Linha compacta "continue de onde parou". */
export function CourseRow({ course }: { course: Course }) {
  const { d } = useApp()
  const router = useRouter()
  const st = d.courseStats[course.id]
  return (
    <button type="button" className="crow" onClick={() => router.push(`/aula/${course.id}/${st.resume.id}`)}>
      <CourseArt course={course} ratio="1 / 1" className="crow-art" />
      <span className="crow-text">
        <b>{course.title}</b>
        <small>
          Aula {lessonNumber(course, st.resume.id)} · {st.resume.title}
        </small>
        <Progress value={st.pct} size="sm" label="Progresso" />
      </span>
      <span className="crow-pct">{st.pct}%</span>
    </button>
  )
}
