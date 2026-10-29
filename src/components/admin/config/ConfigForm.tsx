'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Select, Tabs, Toggle } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { saveConfigAction } from '@/lib/actions/config'
import {
  CONFIG_LIMITS as L,
  DEFAULT_CONFIG,
  SORTS,
  SORT_LABELS,
  validateConfig,
  type AppConfig,
  type ConfigErrors,
} from '@/lib/app-config'
import { AdminHead, Notice } from '../ui'
import { LaunchPromoToggle } from './LaunchPromoToggle'

export type Fact = [label: string, value: string]

type Group = 'plataforma' | 'catalogo' | 'publicacao' | 'notificacoes' | 'audiencia' | 'tecnico'
const GROUPS: { value: Group; label: string; icon: IconName }[] = [
  { value: 'plataforma', label: 'Plataforma', icon: 'Globe' },
  { value: 'catalogo', label: 'Catálogo', icon: 'LayoutGrid' },
  { value: 'publicacao', label: 'Publicação', icon: 'Send' },
  { value: 'notificacoes', label: 'Avisos', icon: 'Bell' },
  { value: 'audiencia', label: 'Audiência (técnico)', icon: 'Activity' },
  { value: 'tecnico', label: 'Armazenamento e integrações', icon: 'Database' },
]

const same = (a: AppConfig, b: AppConfig) => JSON.stringify(a) === JSON.stringify(b)

/** Configurações da plataforma, em abas. Salva tudo de uma vez; o banco confere o papel e os limites. */
export function ConfigForm({
  initial,
  updatedAt,
  facts,
  launchPromo,
}: {
  initial: AppConfig
  updatedAt: string | null
  facts: Fact[]
  /** Promoção de lançamento ligada? null = SQL do cupom ainda não rodado. */
  launchPromo: boolean | null
}) {
  const router = useRouter()
  const { toast } = useApp()
  const [group, setGroup] = useState<Group>('plataforma')
  const [saved, setSaved] = useState(initial)
  const [version, setVersion] = useState(updatedAt)
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<ConfigErrors>({})
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [pending, start] = useTransition()
  const dirty = !same(draft, saved)

  const patch = <K extends keyof AppConfig>(key: K, value: Partial<AppConfig[K]>) =>
    setDraft((d) => ({ ...d, [key]: typeof d[key] === 'object' ? { ...(d[key] as object), ...value } : value }) as AppConfig)

  const save = (force = false) => {
    const found = validateConfig(draft)
    setErrors(found)
    if (Object.keys(found).length) return toast('Revise os campos destacados.', 'err')
    start(async () => {
      setError('')
      setConflict(false)
      const payload = { ...draft, name: draft.name.trim() }
      const r = await saveConfigAction({ config: payload, expected: version, force })
      if (!r.ok) {
        if (r.code === 'FA409') setConflict(true)
        return setError(r.error)
      }
      setSaved(payload)
      setDraft(payload)
      setVersion(r.updatedAt)
      toast('Configurações salvas.', 'ok')
      router.refresh()
    })
  }

  return (
    <div className="ad-page">
      <AdminHead
        title="Configurações"
        lead="Ajustes gerais da Folyo: textos, catálogo, regras de publicação, avisos e parâmetros técnicos da audiência."
        actions={
          <>
            <span className={'ad-save-state ' + (dirty ? 'dirty' : 'ok')}>
              <Icon name={dirty ? 'CircleDot' : 'CircleCheck'} size={14} />
              {dirty ? 'Alterações não salvas' : 'Tudo salvo'}
            </span>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(saved)
                  setErrors({})
                  setError('')
                }}
              >
                Descartar
              </Button>
            )}
            <Button icon="Save" disabled={!dirty || pending} onClick={() => save()}>
              {pending ? 'Salvando…' : 'Salvar'}
            </Button>
          </>
        }
      />
      {error && (
        <Notice
          tone="err"
          action={
            conflict ? (
              <Button size="sm" variant="quiet" disabled={pending} onClick={() => save(true)}>
                Salvar mesmo assim
              </Button>
            ) : undefined
          }
        >
          {error}
          {conflict && ' Recarregue a página para ver o que mudou, ou salve mesmo assim para sobrescrever.'}
        </Notice>
      )}
      <Tabs label="Grupos de configuração" value={group} onChange={setGroup} tabs={GROUPS} />

      <div className="panel ad-form">
        {group === 'plataforma' && (
          <div className="ad-fgrid">
            <Field label="Nome da plataforma *" id="s-name" error={errors.name} hint="Aparece no título da aba do navegador.">
              <input id="s-name" className="inp" value={draft.name} maxLength={L.name.max} onChange={(e) => patch('name', e.target.value as never)} />
            </Field>
            <Field label="E-mail de suporte" id="s-mail" error={errors.supportEmail} hint="Mostrado para contas suspensas e no pedido de exclusão de conta.">
              <input id="s-mail" className="inp" type="email" value={draft.supportEmail} maxLength={L.supportEmail} onChange={(e) => patch('supportEmail', e.target.value.trim() as never)} />
            </Field>
            <Field label="Frase da tela de entrada" id="s-tag" className="span-2">
              <textarea id="s-tag" className="ta" rows={2} maxLength={L.tagline} value={draft.tagline} onChange={(e) => patch('tagline', e.target.value as never)} />
            </Field>
            <div className="span-2">
              <Notice>Logo, cores e tipografia seguem a identidade da Folyo e ficam no código do produto, para não quebrar o contraste e a consistência das telas.</Notice>
            </div>
          </div>
        )}

        {group === 'catalogo' && (
          <div className="ad-fgrid">
            <Field label="Ordenação padrão de Explorar cursos" id="s-sort">
              <Select id="s-sort" label="Ordenação padrão" value={draft.catalog.defaultSort} onChange={(v) => patch('catalog', { defaultSort: v })} options={SORTS.map((v) => ({ value: v, label: SORT_LABELS[v] }))} />
            </Field>
            <Field label="Itens por página nas listas do painel" id="s-ps" error={errors.pageSize}>
              <input id="s-ps" type="number" className="inp" min={L.pageSize.min} max={L.pageSize.max} value={draft.catalog.pageSize} onChange={(e) => patch('catalog', { pageSize: Number(e.target.value) })} />
            </Field>
            <div className="span-2">
              <Toggle label="Mostrar selo Gratuito/Pro nos cards" checked={draft.catalog.showPlanBadge} onChange={(v) => patch('catalog', { showPlanBadge: v })} />
            </div>
            <div className="span-2">
              <LaunchPromoToggle initial={launchPromo} />
            </div>
          </div>
        )}

        {group === 'publicacao' && (
          <div className="ad-toggles">
            <Toggle
              label="Exigir capa para publicar"
              hint="Impede publicar cursos que ainda usam a arte padrão."
              checked={draft.publishing.requireCoverToPublish}
              onChange={(v) => patch('publishing', { requireCoverToPublish: v })}
            />
            <p className="ad-help">Cursos novos sempre começam como rascunho. Para publicar, o curso precisa de pelo menos uma aula publicada, vídeo em todas elas e um projeto final definido.</p>
          </div>
        )}

        {group === 'notificacoes' && (
          <div className="ad-fgrid">
            <Field label="Avisar sobre rascunhos parados há (dias)" id="s-stale" error={errors.draftStaleDays}>
              <input id="s-stale" type="number" className="inp" min={L.draftStaleDays.min} max={L.draftStaleDays.max} value={draft.notifications.draftStaleDays} onChange={(e) => patch('notifications', { draftStaleDays: Number(e.target.value) })} />
            </Field>
            <div className="span-2">
              <Toggle label="Avisar sobre aulas publicadas sem vídeo" hint="Aparece na Visão geral do painel." checked={draft.notifications.alertMissingVideo} onChange={(v) => patch('notifications', { alertMissingVideo: v })} />
            </div>
          </div>
        )}

        {group === 'audiencia' && (
          <>
            <p className="ad-help">Valores usados pelo player e pela tela Audiência. Intervalos menores deixam o “ao vivo” mais preciso e geram mais gravações no banco.</p>
            <div className="ad-fgrid">
              <Field label="Intervalo do sinal (s)" id="s-hb" error={errors.heartbeatSec} hint="Tempo entre um sinal e outro enquanto a aula está aberta.">
                <input id="s-hb" type="number" className="inp" min={L.heartbeatSec.min} max={L.heartbeatSec.max} value={draft.analytics.heartbeatSec} onChange={(e) => patch('analytics', { heartbeatSec: Number(e.target.value) })} />
              </Field>
              <Field label="Considerar “assistindo” por até (s)" id="s-live" error={errors.liveTimeoutSec} hint="Sem sinal depois disso, a sessão deixa de contar como assistindo.">
                <input id="s-live" type="number" className="inp" value={draft.analytics.liveTimeoutSec} onChange={(e) => patch('analytics', { liveTimeoutSec: Number(e.target.value) })} />
              </Field>
              <Field label="Considerar “ativo agora” por até (s)" id="s-act" error={errors.activeTimeoutSec}>
                <input id="s-act" type="number" className="inp" value={draft.analytics.activeTimeoutSec} onChange={(e) => patch('analytics', { activeTimeoutSec: Number(e.target.value) })} />
              </Field>
              <Field label="Guardar o histórico de visualizações por (dias)" id="s-ret" error={errors.retentionDays} hint="Registros mais antigos são apagados automaticamente.">
                <input id="s-ret" type="number" className="inp" min={L.retentionDays.min} max={L.retentionDays.max} value={draft.analytics.retentionDays} onChange={(e) => patch('analytics', { retentionDays: Number(e.target.value) })} />
              </Field>
            </div>
            <Button variant="ghost" size="sm" onClick={() => patch('analytics', { ...DEFAULT_CONFIG.analytics })}>
              Restaurar valores recomendados
            </Button>
          </>
        )}

        {group === 'tecnico' && (
          <>
            <dl className="ad-dl wide">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <Notice>Nenhuma chave ou senha aparece nesta página. Chaves de serviços (como o Bunny Stream) ficam só nas variáveis de ambiente do servidor, nunca no navegador nem no banco.</Notice>
          </>
        )}
      </div>
    </div>
  )
}
