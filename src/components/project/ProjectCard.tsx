'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Art } from '@/components/ui/Art'
import { Pill, Progress, StatusPill } from '@/components/ui/indicators'
import { findCourse } from '@/lib/domain/catalog'
import type { Project } from '@/lib/types'

/** Card de projeto (início e lista de projetos). */
export function ProjectCard({ p, i = 0, showCV = true }: { p: Project; i?: number; showCV?: boolean }) {
  const { s, catalog } = useApp()
  const router = useRouter()
  const done = p.steps.filter((st) => st.done).length
  const inCV = s.resume.projects.includes(p.id)
  const course = p.courseId ? findCourse(catalog, p.courseId) : null
  const href = '/projetos/' + p.id
  return (
    <article className="pcard rise" style={{ '--i': i } as CSSProperties} onClick={() => router.push(href)}>
      <Art tone={p.tone} seed={(p.title.length + i) % 5} ratio="4 / 3" className="pcard-art">
        <span className="pcard-title-on-art">{p.title.split('·')[0].trim()}</span>
      </Art>
      <div className="pcard-body">
        <div className="pcard-tags">
          <StatusPill status={p.status} />
          {showCV && inCV && (
            <Pill tone="blue" icon="FileText">
              No currículo
            </Pill>
          )}
          {p.origin === 'externo' && (
            <Pill tone="neutral" icon="ExternalLink">
              Externo
            </Pill>
          )}
        </div>
        <h3>
          <Link href={href} onClick={(e) => e.stopPropagation()}>
            {p.title}
          </Link>
        </h3>
        <p className="pcard-src">{course ? course.title : 'Projeto feito fora da Folyo'}</p>
        {p.status !== 'concluido' && p.steps.length > 0 && (
          <div className="pcard-steps">
            <Progress value={(done / p.steps.length) * 100} size="sm" tone="magenta" label="Etapas" />
            <small>
              {done}/{p.steps.length} etapas
            </small>
          </div>
        )}
        {p.status === 'concluido' && (
          <div className="chips-mini">
            {p.skills.slice(0, 3).map((sk) => (
              <span key={sk}>{sk}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}
