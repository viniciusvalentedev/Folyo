'use client'

import { useRouter } from 'next/navigation'
import { useState, type CSSProperties } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { Modal } from '@/components/ui/Modal'
import { offersProject } from '@/lib/domain/derive'
import { formatDate } from '@/lib/format'
import type { Certificate } from '@/lib/types'
import { OnTheWay } from './OnTheWay'

/** Desenho do certificado (com marca d'água "DEMONSTRAÇÃO"). */
function CertSheet({ cert, name }: { cert: Certificate; name: string }) {
  return (
    <div className="certsheet" role="img" aria-label={`Certificado de conclusão de ${cert.course.title}`}>
      <div className="cs-top">
        <Wordmark height={34} tone="indigo" text="var(--ink)" />
        <em>Certificado de conclusão</em>
      </div>
      <p className="cs-k">Certificamos que</p>
      <p className="cs-name">{name}</p>
      <p className="cs-k">{offersProject(cert.course) ? 'concluiu as aulas e o projeto prático do curso' : 'concluiu as aulas do curso'}</p>
      <p className="cs-course">{cert.course.title}</p>
      {cert.course.certificate?.note ? <p className="cs-skills">{cert.course.certificate.note}</p> : null}
      <p className="cs-skills">{cert.course.skills.join(' · ')}</p>
      <div className="cs-foot">
        <div>
          <small>Concluído em</small>
          <b>{formatDate(cert.date, true)}</b>
        </div>
        <div>
          <small>Carga horária</small>
          <b>{cert.course.certificate?.hours || cert.course.hours} h</b>
        </div>
        <div>
          <small>Código</small>
          <b className="mono">{cert.code}</b>
        </div>
      </div>
      <svg className="cs-art" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="cs-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9E23F" />
            <stop offset="1" stopColor="#DD33CF" />
          </linearGradient>
        </defs>
        <MarkPath x={66} y={52} r={44} fill="url(#cs-g)" rotate={-10} />
      </svg>
    </div>
  )
}

export function CertificatesView() {
  const { s, d, a, toast, catalog } = useApp()
  const router = useRouter()
  const [viewing, setViewing] = useState<Certificate | null>(null)
  const [downloadInfo, setDownloadInfo] = useState(false)

  return (
    <div className="page surface-ink certs-page">
      <header className="pagehead rise">
        <p className="eyebrow">Conquiste</p>
        <h1>Certificados</h1>
        <p className="lead">
          Emitidos quando você conclui as aulas de um curso e, quando o curso pede, envia o projeto em PDF ou link.
        </p>
      </header>

      {d.certificates.length === 0 &&
        (catalog.courses.length ? (
          <EmptyState
            icon="Award"
            title="Nenhum certificado ainda"
            action={
              <Button variant="go" iconRight="ArrowRight" onClick={() => router.push('/cursos')}>
                Explorar cursos
              </Button>
            }
          >
            Conclua as aulas e o projeto de um curso para receber o primeiro.
          </EmptyState>
        ) : (
          <EmptyState icon="Award" title="Seus certificados vão aparecer aqui">
            Seus próximos aprendizados começam aqui. Em breve, novos cursos para transformar conhecimento em projetos reais.
          </EmptyState>
        ))}

      <div className="cert-grid">
        {d.certificates.map((c, i) => (
          <article key={c.id} className="cert-card rise" style={{ '--i': i } as CSSProperties}>
            <button
              type="button"
              className="cert-thumb"
              onClick={() => setViewing(c)}
              aria-label={`Visualizar certificado de ${c.course.title}`}
            >
              <CertSheet cert={c} name={s.user.name} />
            </button>
            <div className="cert-info">
              <div>
                <h2>{c.course.title}</h2>
                <p className="muted-on-dark">Folyo · {formatDate(c.date, true)}</p>
                <div className="chips">
                  {c.course.skills.map((sk) => (
                    <span key={sk} className="chip-dark">
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
              <div className="cert-actions">
                <Button variant="quiet-dark" size="sm" icon="Eye" onClick={() => setViewing(c)}>
                  Visualizar
                </Button>
                <Button variant="quiet-dark" size="sm" icon="Download" onClick={() => setDownloadInfo(true)}>
                  Baixar
                </Button>
                <Toggle
                  label="No currículo"
                  checked={c.inCV}
                  onChange={(v) => {
                    a.toggleCertCV(c.id, v)
                    toast(v ? 'Certificado incluído no currículo.' : 'Certificado removido do currículo.', 'ok')
                  }}
                  id={'cert-cv-' + c.id}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <OnTheWay />

      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? viewing.course.title : ''}
        eyebrow="Certificado de conclusão"
        size="lg"
        tone="ink"
        footer={
          viewing && (
            <>
              <Button variant="quiet-dark" icon="Download" onClick={() => setDownloadInfo(true)}>
                Baixar
              </Button>
              <Button
                variant="go"
                icon={viewing.inCV ? 'Check' : 'FilePlus2'}
                onClick={() => {
                  a.toggleCertCV(viewing.id, true)
                  toast('Certificado incluído no currículo.', 'ok')
                  setViewing(null)
                }}
              >
                {viewing.inCV ? 'Já está no currículo' : 'Adicionar ao currículo'}
              </Button>
            </>
          )
        }
      >
        {viewing && <CertSheet cert={viewing} name={s.user.name} />}
      </Modal>

      <Modal
        open={downloadInfo}
        onClose={() => setDownloadInfo(false)}
        title="Download do certificado"
        size="sm"
        footer={
          <Button variant="ghost" onClick={() => setDownloadInfo(false)}>
            Entendi
          </Button>
        }
      >
        <div className="alert alert-info">
          <Icon name="Info" size={18} />
          <div>
            O download em PDF ainda não está disponível. Por enquanto, use “Visualizar” para ver o certificado completo e inclua-o
            no currículo pela própria Folyo.
          </div>
        </div>
      </Modal>
    </div>
  )
}
