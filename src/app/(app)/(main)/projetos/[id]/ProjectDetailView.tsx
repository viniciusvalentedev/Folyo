'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { MarkPath } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { Art } from '@/components/ui/Art'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, Pill, StatusPill } from '@/components/ui/indicators'
import { ConfirmModal, Modal } from '@/components/ui/Modal'
import { useBack } from '@/components/ui/PageHead'
import { findCourse } from '@/lib/domain/catalog'
import { formatDate, plural } from '@/lib/format'
import { LIMITS, safeUrl } from '@/lib/validation'

export function ProjectDetailView({ id }: { id: string }) {
  const { s, a, toast, catalog } = useApp()
  const router = useRouter()
  const back = useBack()
  const project = s.projects.find((p) => p.id === id)
  const [finished, setFinished] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  const [showMissing, setShowMissing] = useState(false)

  if (!project) {
    return (
      <div className="page surface-paper">
        <EmptyState icon="SearchX" title="Projeto não encontrado" action={<Button onClick={() => router.push('/projetos')}>Ver projetos</Button>} />
      </div>
    )
  }

  const course = project.courseId ? findCourse(catalog, project.courseId) : null
  const inCV = s.resume.projects.includes(project.id)
  const editable = project.status !== 'concluido'
  const doneSteps = project.steps.filter((x) => x.done).length

  const missing: string[] = []
  if (project.steps.some((x) => !x.done)) missing.push(`Concluir ${plural(project.steps.length - doneSteps, 'etapa', 'etapas')}`)
  if ((project.result || '').trim().length < 30) missing.push('Descrever o resultado final (pelo menos 30 caracteres)')
  if (!(project.problem || '').trim()) missing.push('Explicar o problema que o projeto resolve')

  const finish = () => {
    if (missing.length) {
      setShowMissing(true)
      toast('Ainda faltam itens para finalizar o projeto.', 'err')
      return
    }
    const added = a.finishProject(project.id)
    setFinished(true)
    if (added.length)
      setTimeout(
        () => toast(`${plural(added.length, 'competência adicionada', 'competências adicionadas')}: ${added.join(', ')}.`, 'info'),
        300,
      )
  }

  const toggleCV = () => {
    a.toggleProjectCV(project.id, !inCV)
    toast(
      inCV ? 'Projeto removido do currículo.' : 'Projeto incluído no currículo.',
      'ok',
      inCV ? {} : { actionLabel: 'Ver currículo', onAction: () => router.push('/curriculo') },
    )
  }

  return (
    <div className="page surface-paper project-detail">
      <div className="pd-hero">
        <Art tone={project.tone} seed={project.title.length % 5} ratio="auto" className="pd-art">
          <div className="pd-hero-in">
            <button
              type="button"
              className={'backlink ' + (['blue', 'ink'].includes(project.tone) ? 'on-dark' : '')}
              onClick={() => back('/projetos')}
            >
              <Icon name="ArrowLeft" size={16} />
              Projetos
            </button>
            <div className="pd-tags">
              <StatusPill status={project.status} />
              {inCV && (
                <Pill tone="blue" icon="FileText">
                  No currículo
                </Pill>
              )}
              <Pill tone="neutral" icon={project.origin === 'externo' ? 'ExternalLink' : 'BookOpen'}>
                {course ? 'Curso: ' + course.title : 'Projeto externo'}
              </Pill>
            </div>
            <h1 className="display">{project.title}</h1>
            <p className="pd-lead">{project.desc}</p>
          </div>
        </Art>
      </div>

      <div className="pd-bar">
        <div className="pd-bar-meta">
          {project.status === 'concluido' ? (
            <span>
              <Icon name="Calendar" size={15} />
              Concluído em {formatDate(project.completedAt)}
            </span>
          ) : (
            <span>
              <Icon name="ListChecks" size={15} />
              {doneSteps} de {project.steps.length} etapas
            </span>
          )}
          {course && (
            <Link href={'/cursos/' + course.id}>
              <Icon name="BookOpen" size={15} />
              {course.title}
            </Link>
          )}
        </div>
        <div className="pd-bar-actions">
          <Button variant="quiet" icon="Pencil" onClick={() => router.push(`/projetos/${project.id}/editar`)}>
            Editar
          </Button>
          {project.status === 'concluido' ? (
            <Button variant={inCV ? 'quiet' : 'primary'} icon={inCV ? 'Check' : 'FilePlus2'} onClick={toggleCV}>
              {inCV ? 'No currículo' : 'Incluir no currículo'}
            </Button>
          ) : (
            <Button variant="primary" icon="Flag" onClick={finish}>
              Finalizar projeto
            </Button>
          )}
        </div>
      </div>

      {editable && showMissing && missing.length > 0 && (
        <div className="alert alert-err" role="alert">
          <Icon name="CircleAlert" size={18} />
          <div>
            <b>Para finalizar, falta:</b>
            <ul>
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {project.status === 'revisao' && (
        <div className="alert alert-warn">
          <Icon name="CircleAlert" size={18} />
          <div>
            <b>Este projeto precisa de revisão.</b> Descreva o resultado e confirme as etapas para ele contar como
            evidência no currículo. Use &quot;Editar&quot; para completar.
          </div>
        </div>
      )}

      <div className="pd-cols">
        <div className="pd-main">
          <section className="pd-sec">
            <h2 className="h-sec">O problema</h2>
            {editable ? (
              <textarea
                className="ta"
                rows={3}
                maxLength={LIMITS.text}
                value={project.problem}
                placeholder="Que situação real este projeto resolve?"
                onChange={(e) => a.setProjectField(project.id, { problem: e.target.value })}
                aria-label="Problema que o projeto resolve"
              />
            ) : (
              <p className="pd-text">{project.problem}</p>
            )}
          </section>

          <section className="pd-sec">
            <div className="section-head">
              <h2 className="h-sec">Etapas</h2>
              {editable && (
                <span className="muted">
                  {doneSteps}/{project.steps.length}
                </span>
              )}
            </div>
            <ol className="pd-steps">
              {project.steps.map((step, i) => (
                <li key={step.id} className={step.done ? 'done' : ''}>
                  <div className="pds-head">
                    {editable ? (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={step.done}
                          onChange={(e) => {
                            a.updateStep(project.id, step.id, { done: e.target.checked })
                            if (e.target.checked) toast(`Etapa concluída: ${step.title}.`, 'ok')
                          }}
                        />
                        <span className="check-ui">
                          <Icon name="Check" size={13} />
                        </span>
                      </label>
                    ) : (
                      <span className="pds-n">{i + 1}</span>
                    )}
                    <b>{step.title}</b>
                  </div>
                  {editable ? (
                    <textarea
                      className="ta ta-sm"
                      rows={2}
                      maxLength={LIMITS.text}
                      value={step.note}
                      placeholder="O que você fez nesta etapa? Registre decisões e números."
                      onChange={(e) => a.updateStep(project.id, step.id, { note: e.target.value })}
                      aria-label={`Anotação da etapa ${step.title}`}
                    />
                  ) : (
                    step.note && <p className="pd-text">{step.note}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>

          <section className="pd-sec">
            <h2 className="h-sec">Resultado final</h2>
            {editable ? (
              <>
                <textarea
                  className="ta"
                  rows={4}
                  maxLength={LIMITS.long}
                  value={project.result}
                  placeholder="O que mudou por causa do projeto? Sempre que puder, use números reais e diga de onde vieram."
                  onChange={(e) => a.setProjectField(project.id, { result: e.target.value })}
                  aria-label="Resultado final"
                />
                <small className="muted">{(project.result || '').trim().length}/30 caracteres mínimos</small>
              </>
            ) : (
              <blockquote className="pd-result">{project.result || 'Resultado ainda não descrito.'}</blockquote>
            )}
          </section>
        </div>

        <aside className="pd-side">
          <section>
            <p className="eyebrow">Habilidades demonstradas</p>
            <div className="chips">
              {project.skills.map((sk) => (
                <Link key={sk} href="/competencias" className="chip-static link">
                  {sk}
                </Link>
              ))}
            </div>
          </section>
          <section>
            <p className="eyebrow">Ferramentas</p>
            {project.tools.length ? (
              <div className="chips">
                {project.tools.map((t) => (
                  <span key={t} className="chip-static">
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">Nenhuma registrada.</p>
            )}
          </section>
          <section>
            <p className="eyebrow">Arquivos e links</p>
            {project.links.length ? (
              <ul className="pd-links">
                {project.links.map((l) => {
                  // Só exibimos links http(s): bloqueia "javascript:" e outros esquemas perigosos.
                  const href = safeUrl(l.url)
                  return (
                    <li key={l.id}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer">
                          <Icon name="Link" size={15} />
                          {l.label || href}
                          <Icon name="ExternalLink" size={13} />
                        </a>
                      ) : (
                        <span className="muted">{l.label}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted">Nenhum link. Adicione em &quot;Editar&quot;.</p>
            )}
          </section>
          <section>
            <p className="eyebrow">Datas</p>
            <p className="pd-dates">
              Início: {formatDate(project.startedAt)}
              <br />
              {project.completedAt && project.status === 'concluido'
                ? `Conclusão: ${formatDate(project.completedAt)}`
                : 'Em andamento'}
            </p>
          </section>
          <button type="button" className="link-btn danger" onClick={() => setAskDelete(true)}>
            <Icon name="Trash2" size={14} />
            Excluir projeto
          </button>
        </aside>
      </div>

      <Modal
        open={finished}
        onClose={() => setFinished(false)}
        title="Projeto finalizado"
        size="sm"
        eyebrow="Pratique · Demonstre"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFinished(false)}>
              Agora não
            </Button>
            <Button
              icon="FilePlus2"
              onClick={() => {
                a.toggleProjectCV(project.id, true)
                setFinished(false)
                toast('Projeto incluído no currículo.', 'ok', {
                  actionLabel: 'Ver currículo',
                  onAction: () => router.push('/curriculo'),
                })
              }}
            >
              Incluir no currículo
            </Button>
          </>
        }
      >
        <div className="celebrate light">
          <svg viewBox="0 0 120 120" width="84" height="84" aria-hidden="true">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--blue)" strokeWidth="6" strokeLinecap="round" className="draw" />
            <MarkPath x={60} y={60} r={22} fill="var(--magenta)" />
          </svg>
          <p>
            <b>{project.title}</b> agora está no seu portfólio como projeto concluído. Inclua no currículo para que ele
            conte como evidência das suas competências.
          </p>
        </div>
      </Modal>

      <ConfirmModal
        open={askDelete}
        onClose={() => setAskDelete(false)}
        danger
        title="Excluir projeto?"
        confirmLabel="Excluir"
        body={`"${project.title}" sai do portfólio e do currículo. Essa ação não pode ser desfeita.`}
        onConfirm={() => {
          a.deleteProject(project.id)
          toast('Projeto excluído.', 'info')
          router.replace('/projetos')
        }}
      />
    </div>
  )
}
