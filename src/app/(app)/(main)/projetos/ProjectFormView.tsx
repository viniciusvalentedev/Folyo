'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Art } from '@/components/ui/Art'
import { Button, IconButton } from '@/components/ui/Button'
import { ChipInput, Field, Seg } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { PageHead, useBack } from '@/components/ui/PageHead'
import { newId, todayISO } from '@/lib/format'
import type { Project, Tone } from '@/lib/types'
import { useNow } from '@/lib/use-now'
import { fieldErrors, LIMITS, projectFormSchema } from '@/lib/validation'

const TONES: { value: Tone; label: string }[] = [
  { value: 'blue', label: 'Azul' },
  { value: 'magenta', label: 'Magenta' },
  { value: 'ink', label: 'Preto' },
  { value: 'lime', label: 'Lima' },
]

const TOOL_SUGGESTIONS = ['Canva', 'Excel', 'Google Planilhas', 'Figma', 'Notion', 'Miro', 'Google Docs', 'WhatsApp Business']

/** Projeto em branco. O id só é gerado na hora de salvar. */
function blankProject(today: string): Project {
  return {
    id: '',
    courseId: null,
    origin: 'externo',
    status: 'concluido',
    tone: 'blue',
    title: '',
    desc: '',
    problem: '',
    skills: [],
    tools: [],
    steps: [{ id: 's1', title: '', done: true, note: '' }],
    result: '',
    links: [],
    completedAt: today,
    startedAt: today,
  }
}

/** Novo projeto: a data de hoje vem do relógio do aluno (por isso fica dentro de <Suspense>). */
export function NewProjectFormView() {
  const today = todayISO(useNow())
  return <ProjectFormView initial={blankProject(today)} />
}

/** Formulário de projeto: novo projeto externo (`initial`) ou edição (`id`). */
export function ProjectFormView({ id, initial }: { id?: string; initial?: Project }) {
  const { s, a, toast, catalog } = useApp()
  const router = useRouter()
  const back = useBack()
  const existing = id ? s.projects.find((p) => p.id === id) : null
  const [draft, setDraft] = useState<Project>(() =>
    existing ? structuredClone(existing) : (initial ?? blankProject('')),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (id && !existing) {
    return (
      <div className="page surface-paper">
        <EmptyState icon="SearchX" title="Projeto não encontrado" action={<Button onClick={() => router.push('/projetos')}>Ver projetos</Button>} />
      </div>
    )
  }

  const set = <K extends keyof Project>(key: K, value: Project[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const skillSuggestions = [...new Set([...s.skills.map((k) => k.name), ...catalog.courses.flatMap((c) => c.skills)])]

  const save = () => {
    const parsed = projectFormSchema.safeParse(draft)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      toast('Revise os campos destacados.', 'err')
      return
    }
    setErrors({})
    const p: Project = {
      ...draft,
      id: draft.id || newId('p'),
      title: draft.title.trim(),
      steps: draft.steps.filter((x) => x.title.trim()),
      links: draft.links.filter((l) => l.label.trim() || l.url.trim()),
    }
    if (!p.steps.length) p.steps = [{ id: 's1', title: 'Execução', done: p.status === 'concluido', note: '' }]
    let note = ''
    if (p.status === 'concluido' && p.result.trim().length < 30) {
      p.status = 'revisao'
      note = ' Ele ficou como "precisa de revisão" porque falta descrever o resultado.'
    }
    if (p.status === 'concluido' && !p.completedAt) p.completedAt = todayISO()
    a.saveProject(p)
    toast((existing ? 'Projeto atualizado.' : 'Projeto adicionado ao portfólio.') + note, note ? 'info' : 'ok')
    router.replace('/projetos/' + p.id)
  }

  return (
    <div className="page surface-paper project-form">
      <PageHead
        back="/projetos"
        eyebrow={existing ? 'Editar projeto' : 'Novo projeto externo'}
        title={existing ? existing.title : 'Adicionar um projeto que você fez'}
        lead={
          existing
            ? undefined
            : 'Trabalhos da escola, da faculdade, voluntariado, a empresa da família. Se você fez e consegue explicar, conta.'
        }
      />
      <div className="form-grid">
        <div className="form-main">
          <Field label="Nome do projeto" id="pf-title" error={errors.title}>
            <input
              id="pf-title"
              className="inp"
              value={draft.title}
              maxLength={LIMITS.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="Ex.: Campanha de matrículas do cursinho popular"
            />
          </Field>
          <Field label="Descrição curta" id="pf-desc" hint="Uma frase que explique o que é." error={errors.desc}>
            <input id="pf-desc" className="inp" value={draft.desc} maxLength={LIMITS.short} onChange={(e) => set('desc', e.target.value)} />
          </Field>
          <Field label="Problema que o projeto resolve" id="pf-problem" error={errors.problem}>
            <textarea
              id="pf-problem"
              className="ta"
              rows={3}
              maxLength={LIMITS.text}
              value={draft.problem}
              onChange={(e) => set('problem', e.target.value)}
            />
          </Field>
          <Field label="Etapas realizadas" id="pf-step-0">
            <ol className="form-steps">
              {draft.steps.map((step, i) => (
                <li key={step.id}>
                  <span className="pds-n">{i + 1}</span>
                  <input
                    id={'pf-step-' + i}
                    className="inp"
                    value={step.title}
                    maxLength={LIMITS.title}
                    placeholder="Nome da etapa"
                    onChange={(e) =>
                      set(
                        'steps',
                        draft.steps.map((x) => (x.id === step.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                  <label className="check" title="Etapa concluída">
                    <input
                      type="checkbox"
                      checked={step.done}
                      onChange={(e) =>
                        set(
                          'steps',
                          draft.steps.map((x) => (x.id === step.id ? { ...x, done: e.target.checked } : x)),
                        )
                      }
                    />
                    <span className="check-ui">
                      <Icon name="Check" size={13} />
                    </span>
                    <span className="sr-only">Concluída</span>
                  </label>
                  <IconButton
                    icon="Trash2"
                    label="Remover etapa"
                    onClick={() =>
                      set(
                        'steps',
                        draft.steps.filter((x) => x.id !== step.id),
                      )
                    }
                  />
                </li>
              ))}
            </ol>
            <Button
              variant="quiet"
              size="sm"
              icon="Plus"
              onClick={() => set('steps', [...draft.steps, { id: newId('s'), title: '', done: false, note: '' }])}
            >
              Adicionar etapa
            </Button>
          </Field>
          <Field
            label="Resultado final"
            id="pf-result"
            error={errors.result}
            hint="O que mudou? Use números reais quando tiver e diga de onde vieram. Sem resultado, o projeto fica marcado para revisão."
          >
            <textarea
              id="pf-result"
              className="ta"
              rows={4}
              maxLength={LIMITS.long}
              value={draft.result}
              onChange={(e) => set('result', e.target.value)}
            />
          </Field>
          <Field label="Arquivos e links" id="pf-link-0" error={errors.links}>
            <div className="form-links">
              {draft.links.map((l, i) => (
                <div key={l.id} className="row gap-s">
                  <input
                    id={'pf-link-' + i}
                    className="inp"
                    value={l.label}
                    maxLength={LIMITS.title}
                    placeholder="Descrição"
                    onChange={(e) =>
                      set(
                        'links',
                        draft.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)),
                      )
                    }
                  />
                  <input
                    className="inp"
                    type="url"
                    value={l.url}
                    maxLength={500}
                    placeholder="https://"
                    aria-label="Endereço do link"
                    onChange={(e) =>
                      set(
                        'links',
                        draft.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)),
                      )
                    }
                  />
                  <IconButton
                    icon="Trash2"
                    label="Remover link"
                    onClick={() =>
                      set(
                        'links',
                        draft.links.filter((x) => x.id !== l.id),
                      )
                    }
                  />
                </div>
              ))}
              <Button
                variant="quiet"
                size="sm"
                icon="Plus"
                onClick={() => set('links', [...draft.links, { id: newId('l'), label: '', url: '' }])}
              >
                Adicionar link
              </Button>
            </div>
          </Field>
        </div>

        <aside className="form-side">
          <Field label="Habilidades demonstradas" id="pf-skills" error={errors.skills}>
            <ChipInput
              id="pf-skills"
              values={draft.skills}
              onChange={(v) => set('skills', v)}
              suggestions={skillSuggestions}
              placeholder="Digite e pressione Enter"
            />
          </Field>
          <Field label="Ferramentas utilizadas" id="pf-tools">
            <ChipInput
              id="pf-tools"
              values={draft.tools}
              onChange={(v) => set('tools', v)}
              suggestions={TOOL_SUGGESTIONS}
              placeholder="Ex.: Canva"
            />
          </Field>
          <Field label="Situação" id="pf-status">
            <Seg
              label="Situação"
              value={draft.status === 'revisao' ? 'concluido' : draft.status}
              onChange={(v) => set('status', v)}
              options={[
                { value: 'andamento', label: 'Em andamento' },
                { value: 'concluido', label: 'Concluído' },
              ]}
              size="sm"
            />
          </Field>
          <Field label="Data de conclusão" id="pf-date">
            <input
              id="pf-date"
              type="date"
              className="inp"
              value={draft.completedAt || ''}
              onChange={(e) => set('completedAt', e.target.value)}
            />
          </Field>
          <Field label="Cor da capa" id="pf-tone">
            <div className="tone-pick" role="radiogroup" aria-label="Cor da capa">
              {TONES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.tone === t.value}
                  aria-label={t.label}
                  className={'tone-sw tone-sw-' + t.value + (draft.tone === t.value ? ' on' : '')}
                  onClick={() => set('tone', t.value)}
                />
              ))}
            </div>
          </Field>
          <div className="form-preview">
            <Art tone={draft.tone} seed={draft.title.length % 5} ratio="4 / 3">
              <span className="pcard-title-on-art">{draft.title || 'Seu projeto'}</span>
            </Art>
          </div>
        </aside>
      </div>
      <div className="form-actions">
        <Button variant="ghost" onClick={() => back('/projetos')}>
          Cancelar
        </Button>
        <Button icon="Check" onClick={save}>
          {existing ? 'Salvar alterações' : 'Adicionar ao portfólio'}
        </Button>
      </div>
    </div>
  )
}
