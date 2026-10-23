'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Select } from '@/components/ui/controls'
import { reorderAction } from '@/lib/actions/catalog'
import type { CourseStatus } from '@/lib/admin/catalog'
import type { Tone } from '@/lib/types'
import { fmtDate, fmtNum } from '../ui'
import { CourseActions } from './CourseActions'
import { DataTable, type Column } from './DataTable'
import type { CourseImage } from '@/lib/media'
import { CourseThumb, StatusBadge } from './parts'
import { ReorderModal } from './ReorderModal'

export type CourseListRow = {
  id: string
  title: string
  cat: string
  catName: string
  instructor: string
  featured: boolean
  status: CourseStatus
  publishAt: string | null
  tone: Tone
  glyph: string
  image: CourseImage | null
  /** Contagens de audiência (null se não deu para carregar). */
  stats: { enrolled: number; views: number; live: number } | null
  order: number
  modules: number
  lessons: number
  published: number
  createdAt: string
  updatedAt: string
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const stamp = (v: string) => (Number.isNaN(Date.parse(v)) ? 0 : Date.parse(v))

type SortKey = 'ordem' | 'nome' | 'criacao' | 'atualizacao'

export function CoursesList({
  rows,
  categories,
  canDelete,
}: {
  rows: CourseListRow[]
  categories: { id: string; name: string }[]
  canDelete: boolean
}) {
  const router = useRouter()
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [status, setStatus] = useState<'all' | CourseStatus>('all')
  const [sort, setSort] = useState<SortKey>('ordem')
  const [reorder, setReorder] = useState(false)

  const filtered = useMemo(() => {
    const term = norm(q.trim())
    const list = rows.filter(
      (c) => (!term || norm(c.title).includes(term)) && (cat === 'all' || c.cat === cat) && (status === 'all' || c.status === status),
    )
    const by: Record<SortKey, (a: CourseListRow, b: CourseListRow) => number> = {
      ordem: (a, b) => a.order - b.order,
      nome: (a, b) => a.title.localeCompare(b.title, 'pt-BR'),
      criacao: (a, b) => stamp(b.createdAt) - stamp(a.createdAt),
      atualizacao: (a, b) => stamp(b.updatedAt) - stamp(a.updatedAt),
    }
    return list.sort(by[sort])
  }, [rows, q, cat, status, sort])

  const orderable = useMemo(() => [...rows].filter((c) => c.status !== 'arquivado').sort((a, b) => a.order - b.order), [rows])

  const columns: Column<CourseListRow>[] = [
    {
      key: 'title',
      label: 'Curso',
      render: (c) => (
        <Link href={`/admin/cursos/${c.id}`} className="ad-ccell" onClick={(e) => e.stopPropagation()}>
          <CourseThumb tone={c.tone} glyph={c.glyph} image={c.image} />
          <span>
            <b>{c.title}</b>
            <small>
              {c.catName}
              {c.instructor ? ' · ' + c.instructor : ''}
              {c.featured ? ' · Destaque' : ''}
            </small>
          </span>
        </Link>
      ),
    },
    {
      key: 'content',
      label: 'Conteúdo',
      sortValue: (c) => c.lessons,
      render: (c) => (
        <span className="ad-sub">
          {c.modules} mód. · {c.lessons} aulas
          {c.lessons !== c.published ? ` (${c.published} publicadas)` : ''}
        </span>
      ),
    },
    {
      key: 'audience',
      label: 'Audiência',
      num: true,
      sortValue: (c) => c.stats?.views ?? -1,
      render: (c) =>
        c.stats ? (
          <span className="ad-sub" title="Alunos matriculados · visualizações · assistindo agora">
            {c.stats.enrolled} alunos · {c.stats.views} vis.
            {c.stats.live ? ` · ${c.stats.live} agora` : ''}
          </span>
        ) : (
          <span className="ad-sub">–</span>
        ),
    },
    { key: 'status', label: 'Status', sortValue: (c) => c.status, render: (c) => <StatusBadge status={c.status} publishAt={c.publishAt} /> },
    { key: 'updatedAt', label: 'Atualizado', sortValue: (c) => stamp(c.updatedAt), render: (c) => <span className="ad-sub">{fmtDate(c.updatedAt)}</span> },
    {
      key: 'act',
      label: '',
      sortable: false,
      render: (c) => <CourseActions course={c} canDelete={canDelete} compact />,
    },
  ]

  const counts = (s: CourseStatus) => rows.filter((c) => c.status === s).length

  return (
    <>
      <div className="ad-filters">
        <span className="ad-search-inline">
          <Icon name="Search" size={15} />
          <input className="inp inp-sm" placeholder="Buscar pelo título" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar cursos pelo título" />
        </span>
        <Select<string>
          label="Categoria"
          value={cat}
          onChange={setCat}
          options={[{ value: 'all', label: 'Todas as categorias' }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
        />
        <Select<'all' | CourseStatus>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: `Todos os status (${rows.length})` },
            { value: 'publicado', label: `Publicados (${counts('publicado')})` },
            { value: 'rascunho', label: `Rascunhos (${counts('rascunho')})` },
            { value: 'agendado', label: `Agendados (${counts('agendado')})` },
            { value: 'arquivado', label: `Despublicados (${counts('arquivado')})` },
          ]}
        />
        <Select<SortKey>
          label="Ordenar"
          value={sort}
          onChange={setSort}
          options={[
            { value: 'ordem', label: 'Ordem do catálogo' },
            { value: 'nome', label: 'Nome' },
            { value: 'criacao', label: 'Data de criação' },
            { value: 'atualizacao', label: 'Última atualização' },
          ]}
        />
        <span className="grow" />
        <Button variant="quiet" icon="ArrowUpDown" disabled={!orderable.length} onClick={() => setReorder(true)}>
          Ordem do catálogo
        </Button>
      </div>
      <div className="panel flush">
        <DataTable
          columns={columns}
          rows={filtered}
          pageSize={12}
          caption="Lista de cursos"
          onRow={(c) => router.push('/admin/cursos/' + c.id)}
          resetKey={`${q}|${cat}|${status}|${sort}`}
          empty={
            <EmptyState
              icon="BookOpen"
              title={rows.length ? 'Nenhum curso com esses filtros' : 'Nenhum curso cadastrado'}
              action={
                rows.length ? (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setQ('')
                      setCat('all')
                      setStatus('all')
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : (
                  <ButtonLink href="/admin/cursos/novo" icon="Plus">
                    Criar o primeiro curso
                  </ButtonLink>
                )
              }
            >
              {rows.length ? 'Tente outro termo ou status.' : 'As categorias padrão já estão prontas. Cadastre o primeiro curso da Folyo.'}
            </EmptyState>
          }
        />
      </div>
      <p className="ad-help">
        {fmtNum(filtered.length)} {filtered.length === 1 ? 'curso' : 'cursos'} na lista.
      </p>
      <ReorderModal
        open={reorder}
        onClose={() => setReorder(false)}
        items={orderable.map((c) => ({ id: c.id, label: c.title }))}
        title="Ordem do catálogo"
        hint="Esta é a ordem em que os cursos aparecem para os alunos em “Todo o catálogo” e na ordenação padrão. Arraste ou use as setas."
        onSave={async (ids) => {
          const r = await reorderAction({ kind: 'cursos', ids })
          if (r.ok) {
            toast('Ordem do catálogo salva.', 'ok')
            router.refresh()
          }
          return r
        }}
      />
    </>
  )
}
