'use client'

import { ChipInput, Field, Select, Toggle } from '@/components/ui/controls'
import { CATALOG_LIMITS as L, LANGUAGES, LEVELS } from '@/lib/admin/catalog'
import type { Level } from '@/lib/types'
import { ListEditor } from './ListEditor'
import type { EditorContext, TabProps } from './types'

export function InfoTab({ draft, set, errors, ctx }: TabProps & { ctx: EditorContext }) {
  const { project, certificate } = draft
  const setProject = (patch: Partial<typeof project>) => set({ project: { ...project, ...patch } })
  const setCert = (patch: Partial<typeof certificate>) => set({ certificate: { ...certificate, ...patch } })

  return (
    <div className="ad-form">
      <section className="ad-fs">
        <h3>Informações básicas</h3>
        <div className="ad-fgrid">
          <Field label="Título do curso *" id="c-title" error={errors.title} className="span-2">
            <input id="c-title" className="inp" value={draft.title} maxLength={L.title.max} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Subtítulo" id="c-sub" className="span-2" hint="Uma linha que complementa o título na página do curso.">
            <input id="c-sub" className="inp" value={draft.subtitle} maxLength={L.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
          </Field>
          <Field label="Descrição curta *" id="c-sum" error={errors.summary} className="span-2" hint={`Aparece nos cards do catálogo. ${draft.summary.length}/${L.summary.max}`}>
            <textarea id="c-sum" className="ta" rows={2} maxLength={L.summary.max} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
          </Field>
          <Field
            label="Descrição completa"
            id="c-desc"
            className="span-2"
            hint="Aparece em “Sobre o curso”. Use linhas em branco para separar parágrafos. Obrigatória para publicar."
          >
            <textarea id="c-desc" className="ta" rows={5} maxLength={L.description.max} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          <Field label="Categoria *" id="c-cat" error={errors.cat}>
            <Select<string>
              id="c-cat"
              label="Categoria"
              value={draft.cat}
              onChange={(cat) => set({ cat })}
              options={[
                { value: '', label: 'Escolha uma categoria' },
                ...ctx.categories.map((c) => ({ value: c.id, label: c.name + (c.active ? '' : ' (inativa)') })),
              ]}
            />
          </Field>
          <Field label="Instrutor" id="c-inst">
            <input id="c-inst" className="inp" value={draft.instructor} maxLength={L.instructor} placeholder="Nome de quem ensina" onChange={(e) => set({ instructor: e.target.value })} />
          </Field>
          <Field label="Nível" id="c-lvl">
            <Select<Level> id="c-lvl" label="Nível" value={draft.level} onChange={(level) => set({ level })} options={[...LEVELS]} />
          </Field>
          <Field label="Idioma" id="c-lang">
            <Select<string> id="c-lang" label="Idioma" value={draft.language} onChange={(language) => set({ language })} options={[...LANGUAGES]} />
          </Field>
          <Field label="Duração estimada (horas) *" id="c-hours" error={errors.hours} hint="Aulas + projeto prático.">
            <input
              id="c-hours"
              className="inp"
              type="number"
              min={L.hours.min}
              max={L.hours.max}
              value={Number.isFinite(draft.hours) ? draft.hours : ''}
              onChange={(e) => set({ hours: e.target.value === '' ? NaN : Number(e.target.value) })}
            />
          </Field>
          <Field label="Tags" id="c-tags" hint="Ajudam na busca. Enter para adicionar.">
            <ChipInput id="c-tags" values={draft.tags} onChange={(tags) => set({ tags })} suggestions={ctx.tags} placeholder="Ex.: iniciante, portfólio" max={L.tags.items} maxLength={L.tags.length} />
          </Field>
          <Field label="Público-alvo" id="c-aud" className="span-2">
            <textarea id="c-aud" className="ta" rows={2} maxLength={L.audience} value={draft.audience} placeholder="Para quem este curso foi feito" onChange={(e) => set({ audience: e.target.value })} />
          </Field>
        </div>
      </section>

      <section className="ad-fs">
        <h3>Objetivos de aprendizagem</h3>
        <p className="ad-help">Aparecem em “Ao final, você vai conseguir”. Comece com um verbo.</p>
        <ListEditor id="c-out" values={draft.outcomes} onChange={(outcomes) => set({ outcomes })} placeholder="Ex.: Montar um mapa de concorrentes" max={L.outcomes.items} maxLength={L.outcomes.length} />
        <Field
          label="Skills desenvolvidas (obrigatório para publicar)"
          id="c-skills"
          hint="Uma ou mais. Escolha uma sugestão ou digite outra e tecle Enter. Alimentam as recomendações dos alunos."
        >
          <ChipInput id="c-skills" values={draft.skills} onChange={(skills) => set({ skills })} suggestions={ctx.skills} placeholder="Ex.: Marketing, Comunicação" max={L.skills.items} maxLength={L.skills.length} />
        </Field>
      </section>

      <section className="ad-fs">
        <h3>Projeto prático final</h3>
        <div className="ad-fgrid">
          <Field label="Título do projeto" id="c-pt" className="span-2">
            <input id="c-pt" className="inp" value={project.title} maxLength={L.projectTitle} onChange={(e) => setProject({ title: e.target.value })} />
          </Field>
          <Field label="Enunciado" id="c-pb" className="span-2">
            <textarea id="c-pb" className="ta" rows={2} maxLength={L.projectText} value={project.brief} onChange={(e) => setProject({ brief: e.target.value })} />
          </Field>
          <Field label="Resultado esperado" id="c-pe" className="span-2">
            <textarea id="c-pe" className="ta" rows={2} maxLength={L.projectText} value={project.expected} onChange={(e) => setProject({ expected: e.target.value })} />
          </Field>
        </div>
        <p className="ad-label">Etapas do projeto</p>
        <ListEditor id="c-ps" values={project.steps} onChange={(steps) => setProject({ steps })} placeholder="Ex.: Pesquisa com público" max={L.projectSteps.items} maxLength={L.projectSteps.length} />
        <p className="ad-help">
          Com o projeto definido, o aluno anexa o trabalho (PDF ou link) e o certificado só é liberado depois do envio. Sem projeto, basta concluir as aulas.
        </p>
      </section>

      <section className="ad-fs">
        <h3>Certificado</h3>
        <div className="ad-fgrid">
          <div className="span-2">
            <Toggle
              label="Emitir certificado de conclusão"
              hint="Desligado, o curso não gera certificado para os alunos."
              checked={certificate.enabled}
              onChange={(enabled) => setCert({ enabled })}
            />
          </div>
          {certificate.enabled && (
            <>
              <Field label="Carga horária no certificado (horas)" id="c-ch" error={errors.certHours} hint="Vazio usa a duração estimada do curso.">
                <input
                  id="c-ch"
                  className="inp"
                  type="number"
                  min={1}
                  max={500}
                  value={certificate.hours ?? ''}
                  onChange={(e) => setCert({ hours: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </Field>
              <Field label="Texto complementar" id="c-cn" className="span-2" hint={`Aparece no certificado, abaixo do nome do curso. ${certificate.note.length}/${L.certNote}`}>
                <textarea id="c-cn" className="ta" rows={2} maxLength={L.certNote} value={certificate.note} placeholder="Ex.: Inclui projeto prático avaliado" onChange={(e) => setCert({ note: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
