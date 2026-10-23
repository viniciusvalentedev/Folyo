'use client'

import { useRouter } from 'next/navigation'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { PageHead } from '@/components/ui/PageHead'
import { SoonBlock } from '@/components/ui/SoonBlock'
import { WorksPanel } from '@/components/works/WorksPanel'
import { EXTERNAL } from '@/lib/pdf-file'

/** Projetos e portfólio: o que a pessoa produziu (PDF ou link), por curso e fora da Folyo. */
export function ProjectsView() {
  const { s, d, catalog } = useApp()
  const router = useRouter()
  // Cursos que a pessoa começou ou onde já enviou algum trabalho.
  const courses = catalog.courses.filter((c) => d.courseStats[c.id]?.started || s.works.some((w) => w.courseId === c.id))

  return (
    <div className="page surface-paper projects">
      <PageHead
        eyebrow="Crie"
        title="Projetos e portfólio"
        lead="O projeto de cada curso é o que você produz e anexa aqui, em PDF ou link. Você escolhe o que aparece no portfólio público."
        actions={
          <Button variant="quiet" icon="Globe" onClick={() => router.push('/publico')}>
            Ver portfólio público
          </Button>
        }
      />

      <section className="pf-courses" aria-labelledby="h-cursos">
        <header className="section-head">
          <div>
            <h2 id="h-cursos">Projetos dos cursos</h2>
            <p className="muted">
              Envie o projeto quando quiser, durante ou depois das aulas. Com as aulas concluídas e o projeto enviado, o
              certificado é emitido.
            </p>
          </div>
        </header>
        <p className="store-note">
          <Icon name="HardDrive" size={15} />
          <span>
            Os PDFs ficam guardados com segurança na sua conta e só você os vê. Cada material começa privado: ligue
            &quot;Público&quot; para mostrá-lo no portfólio.
          </span>
        </p>
        {courses.length ? (
          courses.map((course, i) => <WorksPanel key={course.id} course={course} i={i} />)
        ) : catalog.courses.length ? (
          <div className="panel">
            <EmptyState
              icon="FolderOpen"
              title="Seus projetos aparecem aqui"
              action={
                <Button variant="quiet" iconRight="ArrowRight" onClick={() => router.push('/cursos')}>
                  Explorar cursos
                </Button>
              }
            >
              Quando você começa um curso, ele ganha um espaço aqui para você enviar o projeto em PDF ou link.
            </EmptyState>
          </div>
        ) : (
          <SoonBlock compact />
        )}
      </section>

      <section className="pf-projects-sec" aria-label="Trabalhos fora da Folyo">
        <WorksPanel cid={EXTERNAL} />
      </section>
    </div>
  )
}
