'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Select } from '@/components/ui/controls'
import { setLessonPublishedAction } from '@/lib/actions/catalog'
import type { CourseStatus } from '@/lib/admin/catalog'
import { Notice } from '../ui'
import { DataTable, type Column } from './DataTable'
import { StatusBadge } from './parts'

export type LessonRow = {
  id: string
  title: string
  courseId: string
  course: string
  courseStatus: CourseStatus
  module: string
  moduleArchived: boolean
  min: number
  hasVideo: boolean
  materials: number
  published: boolean
  order: number
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function LessonsTable({ rows, courses }: { rows: LessonRow[]; courses: { id: string; title: string }[] }) {
  const router = useRouter()
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const [course, setCourse] = useState('all')
  const [pub, setPub] = useState<'all' | 'sim' | 'nao'>('all')
  const [video, setVideo] = useState<'all' | 'com' | 'sem'>('all')
  const [error, setError] = useState('')
  const [pending, start] = useTransition()

  const filtered = useMemo(() => {
    const term = norm(q.trim())
    return rows.filter(
      (r) =>
        (!term || norm(r.title + ' ' + r.course).includes(term)) &&
        (course === 'all' || r.courseId === course) &&
        (pub === 'all' || (pub === 'sim') === (r.published && !r.moduleArchived)) &&
        (video === 'all' || (video === 'com') === r.hasVideo),
    )
  }, [rows, q, course, pub, video])

  const toggle = (r: LessonRow) =>
    start(async () => {
      setError('')
      const res = await setLessonPublishedAction({ lessonId: r.id, published: !r.published })
      if (!res.ok) return setError(res.error)
      toast(r.published ? 'Aula despublicada: ela some para os alunos.' : 'Aula publicada.', 'ok')
      router.refresh()
    })

  const columns: Column<LessonRow>[] = [
    {
      key: 'title',
      label: 'Aula',
      render: (r) => (
        <span className="ad-two">
          <b>{r.title}</b>
          <small>{r.module}</small>
        </span>
      ),
    },
    {
      key: 'course',
      label: 'Curso',
      render: (r) => (
        <span className="ad-two">
          <Link href={`/admin/cursos/${r.courseId}?aba=conteudo`} onClick={(e) => e.stopPropagation()}>
            {r.course}
          </Link>
          <StatusBadge status={r.courseStatus} />
        </span>
      ),
    },
    { key: 'min', label: 'Duração', num: true, render: (r) => `${r.min} min` },
    {
      key: 'video',
      label: 'Vídeo',
      sortValue: (r) => (r.hasVideo ? 1 : 0),
      render: (r) =>
        r.hasVideo ? (
          <span className="ad-sub">
            <Icon name="Film" size={13} /> Link
          </span>
        ) : (
          <span className="ad-sub">Sem vídeo</span>
        ),
    },
    { key: 'materials', label: 'Materiais', num: true, sortValue: (r) => r.materials },
    {
      key: 'published',
      label: 'Para alunos',
      sortValue: (r) => (r.published && !r.moduleArchived ? 1 : 0),
      render: (r) => (
        <label className="ad-switch" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={r.published} disabled={pending || r.moduleArchived} onChange={() => toggle(r)} />
          <span>{r.moduleArchived ? 'Módulo arquivado' : r.published ? 'Publicada' : 'Rascunho'}</span>
        </label>
      ),
    },
  ]

  const withoutVideo = filtered.filter((r) => !r.hasVideo).length

  return (
    <>
      <div className="ad-filters">
        <span className="ad-search-inline">
          <Icon name="Search" size={15} />
          <input className="inp inp-sm" placeholder="Buscar aula ou curso" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar aula" />
        </span>
        <Select<string> label="Curso" value={course} onChange={setCourse} options={[{ value: 'all', label: 'Todos os cursos' }, ...courses.map((c) => ({ value: c.id, label: c.title }))]} />
        <Select<'all' | 'sim' | 'nao'>
          label="Publicação"
          value={pub}
          onChange={setPub}
          options={[
            { value: 'all', label: 'Publicadas e rascunhos' },
            { value: 'sim', label: 'Publicadas' },
            { value: 'nao', label: 'Não publicadas' },
          ]}
        />
        <Select<'all' | 'com' | 'sem'>
          label="Vídeo"
          value={video}
          onChange={setVideo}
          options={[
            { value: 'all', label: 'Com e sem vídeo' },
            { value: 'com', label: 'Com vídeo' },
            { value: 'sem', label: 'Sem vídeo' },
          ]}
        />
      </div>
      {withoutVideo > 0 && video !== 'com' && (
        <Notice>
          {withoutVideo} {withoutVideo === 1 ? 'aula listada está' : 'aulas listadas estão'} sem vídeo. Um curso só pode ser publicado quando todas as aulas publicadas têm vídeo.
        </Notice>
      )}
      {error && <Notice tone="err">{error}</Notice>}
      <div className="panel flush">
        <DataTable
          columns={columns}
          rows={filtered}
          pageSize={15}
          caption="Aulas"
          initialSort={{ key: 'course', dir: 'asc' }}
          resetKey={`${q}|${course}|${pub}|${video}`}
          onRow={(r) => router.push(`/admin/cursos/${r.courseId}?aba=conteudo`)}
          empty={
            <EmptyState icon="Layers" title="Nenhuma aula encontrada">
              {rows.length ? 'Ajuste os filtros.' : 'Crie um curso para começar.'}
            </EmptyState>
          }
        />
      </div>
    </>
  )
}
