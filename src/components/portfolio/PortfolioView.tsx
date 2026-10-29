'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { Mark, MarkPath } from '@/components/brand/Logo'
import { Button } from '@/components/ui/Button'
import { Art } from '@/components/ui/Art'
import { Icon } from '@/components/ui/Icon'
import { PdfViewer } from '@/components/works/PdfViewer'
import { formatDate } from '@/lib/format'
import { formatFileSize, hostOf, pdfUrl } from '@/lib/pdf-file'
import { publicPdfUrl, type PortfolioData } from '@/lib/public-profile'
import type { Work } from '@/lib/types'

/**
 * O portfólio em si (nome, objetivo, projetos, cursos concluídos e experiência).
 *
 * É o mesmo desenho na pré-visualização do aluno (/publico) e na página aberta a qualquer pessoa
 * (/u/<endereço>): só muda a barra do topo (`bar`), os avisos (`alerts`) e de onde vêm os PDFs
 * (`slug` preenchido = PDFs públicos do perfil).
 */

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/

/** Um trabalho público (PDF ou link). */
function PublicWork({ work, slug, onView }: { work: Work; slug?: string; onView: (w: Work) => void }) {
  const isPdf = work.kind === 'pdf'
  const href = (download?: boolean) => (slug ? publicPdfUrl(slug, work.id, download) : pdfUrl(work.id, download))
  return (
    <li className="pw">
      <span className={'work-ico ' + work.kind}>
        <Icon name={isPdf ? 'FileText' : 'Link'} size={18} />
      </span>
      <div>
        <b>{work.title}</b>
        {work.desc && <p>{work.desc}</p>}
        <small>{isPdf && work.file ? `PDF · ${formatFileSize(work.file.size)}` : hostOf(work.url ?? '')}</small>
      </div>
      <div className="pw-actions">
        {isPdf ? (
          <>
            <Button variant="quiet" size="sm" icon="Eye" onClick={() => onView(work)}>
              Ver
            </Button>
            <a className="btn btn-quiet btn-sm" href={href(true)}>
              <Icon name="Download" size={15} />
              <span>Baixar</span>
            </a>
          </>
        ) : (
          work.url && (
            <a className="btn btn-quiet btn-sm" href={work.url} target="_blank" rel="noopener noreferrer">
              <Icon name="ExternalLink" size={15} />
              <span>Abrir</span>
            </a>
          )
        )}
      </div>
    </li>
  )
}

export function PortfolioView({
  data,
  slug,
  bar,
  alerts,
}: {
  data: PortfolioData
  /** Endereço do perfil (só na página pública): os PDFs abrem pela rota pública. */
  slug?: string
  bar?: ReactNode
  alerts?: ReactNode
}) {
  const [viewing, setViewing] = useState<Work | null>(null)

  // Trabalhos agrupados por curso (os de fora da Folyo por último).
  const groups = [
    ...data.courses.map((course) => ({ key: course.id, course, items: data.works.filter((w) => w.courseId === course.id) })),
    { key: '__externo', course: null, items: data.works.filter((w) => !w.courseId) },
  ].filter((g) => g.items.length)
  const completed = data.courses.filter((c) => c.complete)
  const empty = !groups.length && !completed.length

  return (
    <div className="public">
      {bar}
      {alerts}
      <header className="public-hero">
        <div className="public-hero-in">
          <p className="eyebrow on-blue">Portfólio</p>
          <h1>{data.name}</h1>
          {data.headline && <p className="public-headline">{data.headline}</p>}
          {data.goal && (
            <p className="public-goal">
              <Icon name="Target" size={16} />
              {data.goal}
            </p>
          )}
          {data.bio && <p className="public-bio">{data.bio}</p>}
          <p className="public-meta">
            {data.city && (
              <span>
                <Icon name="MapPin" size={15} />
                {data.city}
              </span>
            )}
            {data.email && (
              <span>
                <Icon name="Mail" size={15} />
                {EMAIL.test(data.email) ? <a href={`mailto:${encodeURIComponent(data.email)}`}>{data.email}</a> : data.email}
              </span>
            )}
          </p>
        </div>
        <svg className="public-hero-art" viewBox="0 0 300 300" aria-hidden="true">
          <defs>
            <linearGradient id="ph-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9DB61E" />
              <stop offset="1" stopColor="#ECFF8E" />
            </linearGradient>
          </defs>
          <MarkPath x={210} y={150} r={170} fill="url(#ph-g)" rotate={-8} />
        </svg>
      </header>

      <main className="public-main">
        <p className="eyebrow">
          Aprenda. Crie. <b>Conquiste.</b>
        </p>
        {groups.length > 0 && (
          <section>
            <h2 className="public-h2">Projetos</h2>
            <div className="public-groups">
              {groups.map(({ key, course, items }) => (
                <article key={key} className="pgroup">
                  <header>
                    {course ? (
                      <Art tone={course.tone} glyph={course.glyph} seed={course.seed} ratio="1 / 1" className="pgroup-art" />
                    ) : (
                      <span className="pgroup-art pgroup-ext">
                        <Icon name="Briefcase" size={22} />
                      </span>
                    )}
                    <div>
                      {course ? (
                        <>
                          <h3>{course.title}</h3>
                          <small>
                            {course.complete ? `Curso concluído em ${formatDate(course.completedAt)}` : 'Curso em andamento'}
                            {course.certified ? ' · certificado' : ''} · {course.hours} h
                          </small>
                        </>
                      ) : (
                        <>
                          <h3>Trabalhos fora da Folyo</h3>
                          <small>Projetos feitos por conta própria</small>
                        </>
                      )}
                    </div>
                  </header>
                  <ul className="pworks">
                    {items.map((w) => (
                      <PublicWork key={w.id} work={w} slug={slug} onView={setViewing} />
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </section>
        )}
        {empty && (
          <p className="muted">
            {slug
              ? 'Esta pessoa ainda não publicou projetos nem concluiu cursos.'
              : 'Ainda não há projetos públicos. Em Projetos e portfólio, ligue "Público" nos materiais que quiser mostrar.'}
          </p>
        )}
        <section className="public-two">
          <div>
            <h2 className="public-h2">Cursos concluídos</h2>
            {completed.length ? (
              <ul className="public-certs">
                {completed.map((c) => (
                  <li key={c.id}>
                    <Icon name={c.certified ? 'Award' : 'BookOpen'} size={18} />
                    <span>
                      <b>{c.title}</b>
                      <small>
                        Folyo · {formatDate(c.completedAt)} · {c.hours} h{c.certified ? ' · certificado' : ''}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhum curso concluído ainda.</p>
            )}
          </div>
          <div>
            <h2 className="public-h2">Experiência</h2>
            {data.experiences.length ? (
              <ul className="public-certs">
                {data.experiences.map((x) => (
                  <li key={x.id}>
                    <Icon name="Briefcase" size={18} />
                    <span>
                      <b>{x.role}</b>
                      <small>
                        {x.org} · {x.period}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhuma experiência cadastrada.</p>
            )}
          </div>
        </section>
      </main>
      <footer className="public-foot">
        <Mark size={24} />
        {slug ? (
          <span>
            Portfólio construído na <Link href="/">Folyo</Link>
          </span>
        ) : (
          <span>Portfólio construído na Folyo</span>
        )}
      </footer>
      <PdfViewer work={viewing} onClose={() => setViewing(null)} slug={slug} />
    </div>
  )
}
