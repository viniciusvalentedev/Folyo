'use client'

import { Field, Select, Toggle } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { publishProblems, type AdminCourse, type CourseStatus } from '@/lib/admin/catalog'
import { Notice } from '../../ui'
import { fromLocalInput, toLocalInput } from '../parts'
import type { EditorContext, TabProps } from './types'

const STATUSES: { v: CourseStatus; t: string; d: string }[] = [
  { v: 'rascunho', t: 'Rascunho', d: 'Só a equipe vê. Bom para preparar o conteúdo.' },
  { v: 'publicado', t: 'Publicado', d: 'Aparece no catálogo para os alunos ao salvar.' },
  { v: 'agendado', t: 'Agendado', d: 'Entra no catálogo sozinho na data escolhida.' },
  { v: 'arquivado', t: 'Despublicado', d: 'Sai do catálogo. Quem já começou mantém o acesso.' },
]

export function PublishTab({ draft, set, errors, ctx }: TabProps & { ctx: EditorContext }) {
  const problems = publishProblems(draft)
  const toggle = (key: 'prerequisites' | 'related', id: string) =>
    set({ [key]: draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id] } as Partial<AdminCourse>)
  const wantsLive = draft.status === 'publicado' || draft.status === 'agendado'

  return (
    <div className="ad-form">
      <section className="ad-fs">
        <h3>Status de publicação</h3>
        <div className="ad-radio-cards" role="radiogroup" aria-label="Status">
          {STATUSES.map((s) => (
            <label key={s.v} className={'ad-rc' + (draft.status === s.v ? ' on' : '')}>
              <input type="radio" name="st" checked={draft.status === s.v} onChange={() => set({ status: s.v, publishAt: s.v === 'agendado' ? draft.publishAt : null })} />
              <b>{s.t}</b>
              <small>{s.d}</small>
            </label>
          ))}
        </div>
        {draft.status === 'agendado' && (
          <Field label="Publicar em" id="c-pubat" error={errors.publishAt} hint="Horário de Brasília do seu dispositivo.">
            <input id="c-pubat" type="datetime-local" className="inp" value={toLocalInput(draft.publishAt)} onChange={(e) => set({ publishAt: fromLocalInput(e.target.value) })} />
          </Field>
        )}
        {problems.length > 0 ? (
          <div className={'ad-notice ad-notice-' + (wantsLive ? 'warn' : 'info')}>
            <Icon name="ListChecks" size={17} />
            <div>
              <b>Falta para publicar</b>
              <ul className="ad-problems">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <Notice tone="ok">Tudo pronto: o curso cumpre os requisitos de publicação.</Notice>
        )}
      </section>

      <section className="ad-fs">
        <h3>Organização no catálogo</h3>
        <div className="ad-toggles">
          <Toggle
            label="Visível no catálogo"
            hint="Desligado, o curso publicado só abre por link direto e não aparece na busca."
            checked={!draft.hidden}
            onChange={(visible) => set({ hidden: !visible })}
          />
          <Toggle
            label="Curso em destaque"
            hint="Aparece no bloco de destaque de Explorar cursos (vale o primeiro na ordem do catálogo)."
            checked={draft.featured}
            onChange={(featured) => set({ featured })}
          />
          <Toggle label="Curso recomendado" hint="Sobe na ordenação por relevância." checked={draft.recommended} onChange={(recommended) => set({ recommended })} />
        </div>
        <Field label="Posição no catálogo" id="c-order" hint="Menor número aparece antes. Também dá para arrastar em Cursos › Ordem do catálogo.">
          <input
            id="c-order"
            type="number"
            min={0}
            max={100000}
            className="inp"
            value={Number.isFinite(draft.order) ? draft.order : ''}
            onChange={(e) => set({ order: e.target.value === '' ? 0 : Math.max(0, Math.trunc(Number(e.target.value))) })}
          />
        </Field>
      </section>

      <section className="ad-fs">
        <h3>Pré-requisitos e relacionados</h3>
        {ctx.others.length ? (
          <div className="ad-fgrid">
            {(['prerequisites', 'related'] as const).map((key) => (
              <div key={key}>
                <p className="ad-label">{key === 'prerequisites' ? 'Pré-requisitos' : 'Cursos relacionados'}</p>
                <div className="ad-pickl">
                  {ctx.others.map((c) => (
                    <label key={c.id} className="ad-check">
                      <input type="checkbox" checked={draft[key].includes(c.id)} disabled={!draft[key].includes(c.id) && draft[key].length >= 10} onChange={() => toggle(key, c.id)} />
                      <span>{c.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="ad-help">Cadastre outros cursos para poder ligá-los a este.</p>
        )}
      </section>

      <section className="ad-fs">
        <h3>Acesso</h3>
        <div className="ad-fgrid">
          <Field label="Plano" id="c-plan" hint="Define o selo no catálogo (Gratuito ou Pro).">
            <Select<'free' | 'pro'>
              id="c-plan"
              label="Plano"
              value={draft.plan}
              onChange={(plan) => set({ plan })}
              options={[
                { value: 'free', label: 'Gratuito' },
                { value: 'pro', label: 'Pro' },
              ]}
            />
          </Field>
          <Field label="Quem pode assistir" id="c-access">
            <Select<'todos' | 'assinantes'>
              id="c-access"
              label="Regra de acesso"
              value={draft.access}
              onChange={(access) => set({ access })}
              options={[
                { value: 'todos', label: 'Todos os alunos conectados' },
                { value: 'assinantes', label: 'Somente assinantes Pro' },
              ]}
            />
          </Field>
        </div>
        <Notice>
          A Folyo ainda não tem cobrança nem controle de assinatura. O plano e a regra ficam registrados no curso para quando houver pagamento; hoje, todo aluno conectado consegue
          assistir.
        </Notice>
      </section>
    </div>
  )
}
