'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Field, Seg, Select, Toggle } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { ConfirmModal } from '@/components/ui/Modal'
import { PageHead } from '@/components/ui/PageHead'
import type { Settings } from '@/lib/types'
import { fieldErrors, personalDataSchema } from '@/lib/validation'

type Section = 'dados' | 'privacidade' | 'notificacoes' | 'aprendizagem' | 'preferencias' | 'conta'

const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'dados', label: 'Dados pessoais', icon: 'User' },
  { id: 'privacidade', label: 'Privacidade', icon: 'Shield' },
  { id: 'notificacoes', label: 'Notificações', icon: 'Bell' },
  { id: 'aprendizagem', label: 'Aprendizagem', icon: 'BookOpen' },
  { id: 'preferencias', label: 'Preferências', icon: 'SlidersHorizontal' },
  { id: 'conta', label: 'Conta', icon: 'LogOut' },
]

export function SettingsView() {
  const { s, a, toast } = useApp()
  const router = useRouter()
  const [section, setSection] = useState<Section>('dados')
  const [form, setForm] = useState({ name: s.user.name, email: s.user.email, phone: s.user.phone, city: s.user.city })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [askReset, setAskReset] = useState(false)
  const [askLeave, setAskLeave] = useState(false)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => a.setSetting(k, v)

  const saveData = () => {
    const parsed = personalDataSchema.safeParse(form)
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      toast('Revise os campos destacados.', 'err')
      return
    }
    setErrors({})
    a.setUser({ ...parsed.data, first: parsed.data.name.split(' ')[0] })
    toast('Dados pessoais salvos.', 'ok')
  }

  return (
    <div className="page surface-paper settings-page">
      <PageHead
        title="Configurações"
        lead="Nesta versão de demonstração, as alterações ficam só nesta aba e somem ao recarregar a página."
      />
      <div className="settings-grid">
        <nav className="settings-nav" aria-label="Seções de configuração">
          {SECTIONS.map((x) => (
            <button
              key={x.id}
              type="button"
              className={section === x.id ? 'on' : ''}
              aria-current={section === x.id ? 'true' : undefined}
              onClick={() => setSection(x.id)}
            >
              <Icon name={x.icon} size={17} />
              {x.label}
            </button>
          ))}
        </nav>
        <div className="settings-body" key={section}>
          {section === 'dados' && (
            <section className="set-sec">
              <h2>Dados pessoais</h2>
              <div className="grid-form">
                <Field label="Nome completo" id="st-name" error={errors.name}>
                  <input id="st-name" className="inp" maxLength={80} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="E-mail" id="st-email" error={errors.email}>
                  <input
                    id="st-email"
                    type="email"
                    className="inp"
                    maxLength={254}
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </Field>
                <Field label="Telefone" id="st-phone" error={errors.phone}>
                  <input
                    id="st-phone"
                    type="tel"
                    className="inp"
                    maxLength={30}
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </Field>
                <Field label="Cidade" id="st-city" error={errors.city}>
                  <input id="st-city" className="inp" maxLength={80} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </Field>
              </div>
              <div className="row gap-s">
                <Button icon="Check" onClick={saveData}>
                  Salvar dados
                </Button>
              </div>
            </section>
          )}

          {section === 'privacidade' && (
            <section className="set-sec">
              <h2>Privacidade do perfil</h2>
              <Toggle
                id="st-pub"
                label="Perfil público"
                hint="Qualquer pessoa com o link vê seu perfil e projetos concluídos (o perfil público chega numa próxima etapa)."
                checked={s.settings.publicProfile}
                onChange={(v) => {
                  set('publicProfile', v)
                  toast(v ? 'Perfil público ativado.' : 'Perfil agora é privado.', 'ok')
                }}
              />
              <Toggle
                id="st-port"
                label="Mostrar projetos no portfólio público"
                checked={s.settings.publicPortfolio}
                onChange={(v) => set('publicPortfolio', v)}
              />
              <Toggle
                id="st-mail"
                label="Mostrar e-mail no perfil público"
                hint="Desligado por padrão para proteger seus dados."
                checked={s.settings.showEmail}
                onChange={(v) => set('showEmail', v)}
              />
            </section>
          )}

          {section === 'notificacoes' && (
            <section className="set-sec">
              <h2>Notificações</h2>
              <Toggle
                id="st-n1"
                label="Lembretes de aula"
                hint="Um lembrete no horário de estudo que você escolheu."
                checked={s.settings.notifyLessons}
                onChange={(v) => set('notifyLessons', v)}
              />
              <Toggle
                id="st-n2"
                label="Resumo semanal"
                hint="Aulas, projetos e próximos passos da semana."
                checked={s.settings.notifyWeekly}
                onChange={(v) => set('notifyWeekly', v)}
              />
              <Toggle id="st-n3" label="Novidades e cursos novos" checked={s.settings.notifyNews} onChange={(v) => set('notifyNews', v)} />
              <p className="muted small">Por enquanto, as notificações aparecem apenas no sino do topo da tela.</p>
            </section>
          )}

          {section === 'aprendizagem' && (
            <section className="set-sec">
              <h2>Preferências de aprendizagem</h2>
              <Field label="Meta semanal de aulas" id="st-goal" hint="Usada no início e na página de progresso.">
                <Seg
                  label="Meta semanal"
                  value={String(s.settings.weeklyGoal)}
                  onChange={(v) => {
                    set('weeklyGoal', Number(v))
                    toast(`Meta ajustada para ${v} aulas por semana.`, 'ok')
                  }}
                  options={['3', '5', '7', '10']}
                />
              </Field>
              <Field label="Horário preferido para estudar" id="st-time">
                <Select
                  id="st-time"
                  value={s.settings.studyTime}
                  onChange={(v) => set('studyTime', v)}
                  options={[
                    { value: 'manha', label: 'Manhã' },
                    { value: 'tarde', label: 'Tarde' },
                    { value: 'noite', label: 'Noite' },
                  ]}
                />
              </Field>
              <Toggle id="st-cc" label="Legendas ativadas por padrão" checked={s.settings.captions} onChange={(v) => set('captions', v)} />
              <Toggle
                id="st-auto"
                label="Ir para a próxima aula automaticamente"
                checked={s.settings.autoplay}
                onChange={(v) => set('autoplay', v)}
              />
            </section>
          )}

          {section === 'preferencias' && (
            <section className="set-sec">
              <h2>Preferências</h2>
              <Toggle
                id="st-rm"
                label="Reduzir animações"
                hint="Remove transições e movimentos. Também respeitamos a configuração do seu sistema."
                checked={s.settings.reduceMotion}
                onChange={(v) => set('reduceMotion', v)}
              />
              <Field label="Idioma da interface" id="st-lang">
                <Select
                  id="st-lang"
                  value="pt"
                  onChange={() => toast('Por enquanto a Folyo está disponível apenas em português.', 'info')}
                  options={[
                    { value: 'pt', label: 'Português (Brasil)' },
                    { value: 'en', label: 'English (em breve)' },
                  ]}
                />
              </Field>
            </section>
          )}

          {section === 'conta' && (
            <section className="set-sec">
              <h2>Conta</h2>
              <div className="set-row">
                <div>
                  <b>Sair da conta</b>
                  <small>Volta para a tela de entrada.</small>
                </div>
                <Button variant="quiet" icon="LogOut" onClick={() => setAskLeave(true)}>
                  Sair
                </Button>
              </div>
              <div className="set-row">
                <div>
                  <b>Restaurar demonstração</b>
                  <small>Desfaz tudo que você alterou e volta aos dados originais da Ana.</small>
                </div>
                <Button variant="danger" icon="RotateCcw" onClick={() => setAskReset(true)}>
                  Restaurar
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>

      <ConfirmModal
        open={askReset}
        onClose={() => setAskReset(false)}
        danger
        title="Restaurar dados de demonstração?"
        confirmLabel="Restaurar"
        body="Aulas concluídas, projetos, currículo e competências voltam ao estado inicial."
        onConfirm={() => {
          a.reset()
          toast('Demonstração restaurada.', 'ok')
        }}
      />
      <ConfirmModal
        open={askLeave}
        onClose={() => setAskLeave(false)}
        title="Sair da conta?"
        confirmLabel="Sair"
        body="Você pode entrar de novo a qualquer momento."
        onConfirm={() => router.push('/entrar')}
      />
    </div>
  )
}
