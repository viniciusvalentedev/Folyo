'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type CSSProperties } from 'react'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { categoryOf } from '@/lib/domain/catalog'
import { formatDate } from '@/lib/format'
import { EXTERNAL } from '@/lib/pdf-file'
import type { Course, Work } from '@/lib/types'
import { LinkForm } from './LinkForm'
import { PdfViewer } from './PdfViewer'
import { WorkItem } from './WorkItem'

/**
 * Materiais de um curso (ou de "fora da Folyo"): lista, envio de PDF, links e edição.
 * `bare` mostra só a lista e os botões, sem o cabeçalho do curso (usado na página do curso).
 */
export function WorksPanel({ course, cid, i = 0, bare }: { course?: Course | null; cid?: string; i?: number; bare?: boolean }) {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const key = course ? course.id : cid || EXTERNAL
  const stats = course ? d.courseStats[key] : null
  const works = s.works.filter((w) => (w.courseId ?? EXTERNAL) === key)
  const [viewing, setViewing] = useState<Work | null>(null)
  const [editing, setEditing] = useState<Work | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const brief = course?.project?.title ? course.project : null

  const upload = async (file: File) => {
    setBusy(true)
    const first = !!course && !works.length
    const result = await a.uploadPdf(file, { courseId: key === EXTERNAL ? null : key, title: '' })
    setBusy(false)
    if (!result.ok) {
      toast(result.error, 'err')
      return
    }
    toast(first ? 'Projeto enviado. Você pode dar um título e uma descrição ao arquivo.' : 'PDF salvo. Dê um título e uma descrição, se quiser.', 'ok')
  }

  const body = (
    <div
      className={'cworks-drop' + (drag ? ' drag' : '') + (busy ? ' busy' : '')}
      onDragOver={(e) => {
        e.preventDefault()
        setDrag(true)
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDrag(false)
        const file = e.dataTransfer.files[0]
        if (file && !busy) void upload(file)
      }}
    >
      {works.length > 0 ? (
        <ul className="works">
          {works.map((w) => (
            <WorkItem key={w.id} work={w} onView={setViewing} onEdit={setEditing} />
          ))}
        </ul>
      ) : (
        <p className="cworks-empty">
          {course
            ? 'Envie aqui o seu projeto: um PDF ou o link do que você produziu (documento, apresentação, site, campanha publicada).'
            : 'Trabalhos da escola, da faculdade, voluntariado ou da empresa da família. Se você fez e consegue mostrar, conta.'}
        </p>
      )}
      <div className="cworks-add">
        <Button variant={works.length ? 'quiet' : 'primary'} size="sm" icon={busy ? 'RefreshCw' : 'FileUp'} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Enviando PDF…' : 'Enviar PDF'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) void upload(file)
          }}
          aria-label={course ? `Enviar PDF para ${course.title}` : 'Enviar PDF de trabalho externo'}
        />
        <Button variant="quiet" size="sm" icon="Link" onClick={() => setAdding(true)}>
          Adicionar link
        </Button>
        <small className="muted hide-mobile">ou arraste um PDF para cá · até 20 MB</small>
      </div>
      <PdfViewer work={viewing} onClose={() => setViewing(null)} />
      <LinkForm
        open={adding || !!editing}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        cid={key}
        item={editing}
      />
    </div>
  )

  if (bare) return <div className="cworks-bare">{body}</div>

  return (
    <article className="cworks rise" style={{ '--i': i } as CSSProperties} id={'works-' + key}>
      {course && stats ? (
        <header className="cworks-head">
          <button type="button" className="cworks-art" onClick={() => router.push('/cursos/' + course.id)} aria-label={`Abrir ${course.title}`}>
            <CourseArt course={course} variant="thumb" ratio="4 / 3" />
          </button>
          <div className="cworks-info">
            <p className="ccard-cat">{categoryOf(catalog, course.cat).name}</p>
            <h3>{course.title}</h3>
            <p className="cworks-meta">
              {stats.complete ? (
                <span>
                  <Icon name="CircleCheck" size={14} />
                  Aulas concluídas em {formatDate(stats.completedAt)}
                </span>
              ) : (
                <span>
                  <Icon name="CircleDot" size={14} />
                  {stats.pct}% das aulas
                </span>
              )}
              {brief &&
                (stats.delivered ? (
                  <span className="ok">
                    <Icon name="FolderCheck" size={14} />
                    Projeto enviado
                  </span>
                ) : (
                  <span className="pend">
                    <Icon name="FolderKanban" size={14} />
                    Projeto ainda não enviado
                  </span>
                ))}
              {stats.certified && (
                <span className="ok">
                  <Icon name="Award" size={14} />
                  Certificado
                </span>
              )}
            </p>
            {brief && (
              <div className="cworks-brief">
                <b>Projeto do curso: {brief.title}</b>
                {brief.brief && <p>{brief.brief}</p>}
                {brief.expected && (
                  <p className="cworks-exp">
                    <span>Entregue:</span> {brief.expected}
                  </p>
                )}
              </div>
            )}
          </div>
        </header>
      ) : (
        <header className="cworks-ext">
          <span className="cworks-ext-ico">
            <Icon name="Briefcase" size={20} />
          </span>
          <div>
            <h3>Trabalhos fora da Folyo</h3>
            <p className="muted small">Projetos que você fez por conta própria. Também podem ir para o portfólio público e para o currículo.</p>
          </div>
        </header>
      )}
      {body}
    </article>
  )
}
