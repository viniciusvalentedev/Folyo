'use client'

import { useState } from 'react'
import { signOutAction } from '@/app/(auth)/actions'
import { useApp } from '@/components/providers/AppState'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Select, Toggle } from '@/components/ui/controls'
import { Icon, type IconName } from '@/components/ui/Icon'
import { PageHead } from '@/components/ui/PageHead'
import { supportEmailOf } from '@/lib/app-config'
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
  const { s, a, toast, config } = useApp()
  const supportEmail = supportEmailOf(config)
  const [section, setSection] = useState<Section>('dados')
  const [name, setName] = useState(s.user.name)
  const [phone, setPhone] = useState(s.user.phone)
  const [city, setCity] = useState(s.user.city)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => a.setSetting(k, v)

  const saveData = () => {
    const parsed = personalDataSchema.safeParse({ name, phone, city })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    if (parsed.data.name !== s.user.name) a.saveName(parsed.data.name)
    a.setUser({ phone: parsed.data.phone, city: parsed.data.city })
    toast('Dados pessoais salvos.', 'ok')
  }

  return (
    <div className="page surface-paper settings-page">
      <PageHead
        title="Configurações"
        lead="Tudo o que você muda aqui fica salvo na sua conta."
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
                  <input
                    id="st-name"
                    className="inp"
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="E-mail" id="st-email" hint="É o e-mail que você usa para entrar.">
                  <input id="st-email" type="email" className="inp" value={s.accountEmail} readOnly />
                </Field>
                <Field label="Telefone" id="st-phone">
                  <input
                    id="st-phone"
                    type="tel"
                    className="inp"
                    maxLength={30}
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                <Field label="Cidade" id="st-city">
                  <input id="st-city" className="inp" maxLength={80} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
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
                hint="Qualquer pessoa com o link vê seu perfil e projetos concluídos."
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
                  <b>Trocar senha</b>
                  <small>Escolha uma senha nova para entrar na Folyo.</small>
                </div>
                <ButtonLink variant="quiet" icon="Lock" href="/redefinir-senha">
                  Trocar senha
                </ButtonLink>
              </div>
              <div className="set-row">
                <div>
                  <b>Sair da conta</b>
                  <small>Sai só deste aparelho. Você pode entrar de novo quando quiser.</small>
                </div>
                <form action={signOutAction}>
                  <Button type="submit" variant="quiet" icon="LogOut">
                    Sair
                  </Button>
                </form>
              </div>
              <div className="set-row">
                <div>
                  <b>Apagar conta e dados</b>
                  <small>
                    Por enquanto, peça pelo e-mail {supportEmail}. Apagamos sua conta e todos os seus dados.
                  </small>
                </div>
                <ButtonLink
                  variant="quiet"
                  icon="Mail"
                  href={`mailto:${supportEmail}?subject=Apagar%20minha%20conta`}
                >
                  Pedir
                </ButtonLink>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
