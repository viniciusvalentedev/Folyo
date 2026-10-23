'use client'

import { useState } from 'react'
import { Mark, MarkPath } from '@/components/brand/Logo'
import { CourseArt } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { DemoTag } from '@/components/ui/indicators'
import { useBack } from '@/components/ui/PageHead'
import { PdfViewer } from '@/components/works/PdfViewer'
import { formatDate } from '@/lib/format'
import { formatFileSize, hostOf, pdfUrl } from '@/lib/pdf-file'
import type { Work } from '@/lib/types'

/** Um trabalho público (PDF ou link). */
function PublicWork({ work, onView }: { work: Work; onView: (w: Work) => void }) {
  const isPdf = work.kind === 'pdf'
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
            <a className="btn btn-quiet btn-sm" href={pdfUrl(work.id, true)}>
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

export function PublicView() {
  const { s, d, catalog } = useApp()
  const back = useBack()
  const [viewing, setViewing] = useState<Work | null>(null)

  // Só os trabalhos marcados como "Público", agrupados por curso (os de fora da Folyo por último).
  const groups = [
    ...catalog.courses.map((course) => ({ key: course.id, course, items: s.works.filter((w) => w.courseId === course.id && w.public) })),
    { key: '__externo', course: null, items: s.works.filter((w) => !w.courseId && w.public) },
  ].filter((g) => g.items.length)
  const goal = (s.goals.text || '').trim() || (s.user.objective || '').trim()
  const empty = !groups.length && !d.completedCourses.length

  return (
    <div className="public">
      <div className="public-bar">
        <button type="button" className="backlink" onClick={() => back('/projetos')}>
          <Icon name="ArrowLeft" size={16} />
          Sair da pré-visualização
        </button>
        <DemoTag>Pré-visualização do portfólio</DemoTag>
      </div>
      {!s.settings.publicProfile && (
        <div className="alert alert-warn public-alert">
          <Icon name="Lock" size={18} />
          <div>
            Seu perfil está <b>privado</b>. Só você vê esta página. Mude em Configurações › Privacidade.
          </div>
        </div>
      )}
      <header className="public-hero">
        <div className="public-hero-in">
          <p className="eyebrow on-blue">Portfólio</p>
          <h1>{s.user.name}</h1>
          {s.user.headline && <p className="public-headline">{s.user.headline}</p>}
          {goal && (
            <p className="public-goal">
              <Icon name="Target" size={16} />
              {goal}
            </p>
          )}
          {s.user.bio && <p className="public-bio">{s.user.bio}</p>}
          <p className="public-meta">
            {s.user.city && (
              <span>
                <Icon name="MapPin" size={15} />
                {s.user.city}
              </span>
            )}
            {s.settings.showEmail && s.user.email && (
              <span>
                <Icon name="Mail" size={15} />
                {s.user.email}
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
              {groups.map(({ key, course, items }) => {
                const st = course ? d.courseStats[course.id] : null
                return (
                  <article key={key} className="pgroup">
                    <header>
                      {course ? (
                        <CourseArt course={course} variant="thumb" ratio="1 / 1" className="pgroup-art" />
                      ) : (
                        <span className="pgroup-art pgroup-ext">
                          <Icon name="Briefcase" size={22} />
                        </span>
                      )}
                      <div>
                        {course && st ? (
                          <>
                            <h3>{course.title}</h3>
                            <small>
                              {st.complete ? `Curso concluído em ${formatDate(st.completedAt)}` : 'Curso em andamento'}
                              {st.certified ? ' · certificado' : ''} · {course.hours} h
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
                        <PublicWork key={w.id} work={w} onView={setViewing} />
                      ))}
                    </ul>
                  </article>
                )
              })}
            </div>
          </section>
        )}
        {empty && (
          <p className="muted">
            Ainda não há projetos públicos. Em Projetos e portfólio, ligue &quot;Público&quot; nos materiais que quiser mostrar.
          </p>
        )}
        <section className="public-two">
          <div>
            <h2 className="public-h2">Cursos concluídos</h2>
            {d.completedCourses.length ? (
              <ul className="public-certs">
                {d.completedCourses.map((c) => {
                  const st = d.courseStats[c.id]
                  return (
                    <li key={c.id}>
                      <Icon name={st.certified ? 'Award' : 'BookOpen'} size={18} />
                      <span>
                        <b>{c.title}</b>
                        <small>
                          Folyo · {formatDate(st.completedAt)} · {c.hours} h{st.certified ? ' · certificado' : ''}
                        </small>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted">Nenhum curso concluído ainda.</p>
            )}
          </div>
          <div>
            <h2 className="public-h2">Experiência</h2>
            {s.user.experiences.length ? (
              <ul className="public-certs">
                {s.user.experiences.map((x) => (
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
        <span>Portfólio construído na Folyo</span>
      </footer>
      <PdfViewer work={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}
