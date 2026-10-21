'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { ProjectCard } from '@/components/project/ProjectCard'
import { useApp } from '@/components/providers/AppState'
import { Art } from '@/components/ui/Art'
import { Button } from '@/components/ui/Button'
import { Tabs } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { PageHead } from '@/components/ui/PageHead'
import type { Project } from '@/lib/types'

type Filter = 'todos' | 'andamento' | 'concluido' | 'curriculo' | 'cursos' | 'externos' | 'revisao'

export function ProjectsView() {
  const { s, d } = useApp()
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('todos')

  const tests: Record<Filter, (p: Project) => boolean> = {
    todos: () => true,
    andamento: (p) => p.status === 'andamento',
    concluido: (p) => p.status === 'concluido',
    curriculo: (p) => s.resume.projects.includes(p.id),
    cursos: (p) => p.origin === 'curso',
    externos: (p) => p.origin === 'externo',
    revisao: (p) => p.status === 'revisao',
  }
  const count = (f: Filter) => s.projects.filter(tests[f]).length
  const list = s.projects.filter(tests[filter])
  const highlight = d.projectsDone[0]

  return (
    <div className="page surface-paper projects">
      <PageHead
        eyebrow="Pratique"
        title="Projetos e portfólio"
        lead="Cada projeto é uma evidência do que você sabe fazer. Organize aqui o que fez na Folyo e fora dela."
        actions={
          <Button icon="Plus" onClick={() => router.push('/projetos/novo')}>
            Adicionar projeto externo
          </Button>
        }
      />

      <div className="proj-summary rise" style={{ '--i': 1 } as CSSProperties}>
        <div>
          <b>{d.projectsDone.length}</b>
          <span>concluídos</span>
        </div>
        <div>
          <b>{count('andamento')}</b>
          <span>em andamento</span>
        </div>
        <div>
          <b>{count('curriculo')}</b>
          <span>no currículo</span>
        </div>
        <div className={count('revisao') ? 'warn' : ''}>
          <b>{count('revisao')}</b>
          <span>precisam de revisão</span>
        </div>
      </div>

      {highlight && filter === 'todos' && (
        <section
          className="proj-feature rise"
          style={{ '--i': 2 } as CSSProperties}
          onClick={() => router.push('/projetos/' + highlight.id)}
        >
          <Art tone={highlight.tone} seed={3} ratio="auto" className="proj-feature-art">
            <span className="pf-quote">“{highlight.result}”</span>
          </Art>
          <div className="proj-feature-body">
            <p className="eyebrow">Destaque do portfólio</p>
            <h2>{highlight.title}</h2>
            <p>{highlight.problem}</p>
            <div className="chips">
              {highlight.skills.map((sk) => (
                <span key={sk} className="chip-static">
                  {sk}
                </span>
              ))}
            </div>
            <Link href={'/projetos/' + highlight.id} className="link-sm" onClick={(e) => e.stopPropagation()}>
              Abrir estudo de caso <Icon name="ArrowRight" size={14} />
            </Link>
          </div>
        </section>
      )}

      <Tabs
        label="Filtrar projetos"
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'todos', label: 'Todos', badge: count('todos') },
          { value: 'andamento', label: 'Em andamento', badge: count('andamento') },
          { value: 'concluido', label: 'Concluídos', badge: count('concluido') },
          { value: 'curriculo', label: 'No currículo', badge: count('curriculo') },
          { value: 'cursos', label: 'De cursos', badge: count('cursos') },
          { value: 'externos', label: 'Externos', badge: count('externos') },
          { value: 'revisao', label: 'Para revisar', badge: count('revisao') },
        ]}
      />

      {list.length ? (
        <div className="grid-3 proj-grid" key={filter}>
          {list.map((p, i) => (
            <ProjectCard key={p.id} p={p} i={i} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="FolderOpen"
          title="Nenhum projeto aqui ainda"
          action={
            <Button variant="quiet" icon="Plus" onClick={() => router.push('/projetos/novo')}>
              Adicionar projeto
            </Button>
          }
        >
          {filter === 'curriculo'
            ? 'Abra um projeto concluído e use "Incluir no currículo".'
            : filter === 'revisao'
              ? 'Nenhum projeto precisa de revisão.'
              : 'Projetos aparecem aqui quando você começa um curso ou cadastra algo que fez fora da Folyo.'}
        </EmptyState>
      )}
    </div>
  )
}
