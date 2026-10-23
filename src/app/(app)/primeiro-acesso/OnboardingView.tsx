'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition, type CSSProperties } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { completeOnboardingAction } from '@/lib/actions/profile'
import { AREAS, LIFE_STAGES, WANTS } from '@/lib/trails'

const STEPS = [
  { eyebrow: 'Sobre você', title: 'Em que momento você está?', lead: 'Vamos adaptar a Folyo à sua realidade.' },
  { eyebrow: 'Interesses', title: 'O que desperta seu interesse?', lead: 'Escolha uma ou mais áreas. Você pode explorar novos caminhos.' },
  { eyebrow: 'Objetivos', title: 'O que você quer conquistar agora?', lead: 'Selecione tudo o que faz sentido para você.' },
]

const toggle = (list: string[], set: (next: string[]) => void, id: string) =>
  set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** Primeiro acesso: 3 passos (momento, interesses e objetivos). Tudo é gravado só no final. */
export function OnboardingView() {
  const { s, a, toast } = useApp()
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [stage, setStage] = useState<string | null>(null)
  const [areas, setAreas] = useState<string[]>([])
  const [wants, setWants] = useState<string[]>([])
  const [saving, startSaving] = useTransition()
  const title = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    title.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [step])

  const canGo = step === 0 ? !!stage : step === 1 ? areas.length > 0 : true
  const move = (by: -1 | 1) => {
    setDir(by)
    setStep(step + by)
  }

  /** Salva as respostas no banco e só então segue para o início. */
  const finish = () => {
    if (!stage || !areas.length || saving) return
    const answers = { stage, areas, wants }
    startSaving(async () => {
      const result = await completeOnboardingAction(answers)
      if (!result.ok) {
        toast(result.error, 'err')
        return
      }
      a.completeOnboarding(answers)
      router.replace('/inicio')
    })
  }

  const hint =
    step === 0
      ? stage
        ? null
        : 'Escolha uma opção para continuar.'
      : step === 1
        ? areas.length
          ? areas.length === 1
            ? '1 área escolhida'
            : `${areas.length} áreas escolhidas`
          : 'Escolha pelo menos uma área. Se ainda não sabe, marque “Ainda estou descobrindo”.'
        : wants.length
          ? wants.length === 1
            ? '1 objetivo escolhido'
            : `${wants.length} objetivos escolhidos`
          : 'Se ainda não sabe, pode finalizar sem escolher. Dá para definir depois em Objetivos.'
  const copy = STEPS[step]

  return (
    <div className="onb onb3 surface-paper">
      <header className="onb-top">
        <Wordmark height={34} tone="indigo" text="var(--ink)" />
        <div className="onb-steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={`Passo ${step + 1} de 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />
          ))}
          <small>Passo {step + 1} de 3</small>
        </div>
      </header>

      <main className="onb-main onb3-main" key={step} style={{ '--dir': dir } as CSSProperties}>
        <p className="eyebrow">{step === 0 ? `Boas-vindas, ${s.user.first}` : copy.eyebrow}</p>
        <h1 ref={title} tabIndex={-1} className="onb-title">
          {copy.title}
        </h1>
        <p className="lead onb3-lead">{copy.lead}</p>

        {step === 0 && (
          <div className="onb3-stages" role="radiogroup" aria-label="Momento atual">
            {LIFE_STAGES.map((st) => (
              <label key={st.id} className={'onb3-card' + (stage === st.id ? ' on' : '')}>
                <input type="radio" name="onb-stage" value={st.id} checked={stage === st.id} onChange={() => setStage(st.id)} />
                <span className="onb3-ico">
                  <Icon name={st.icon} size={20} />
                </span>
                <span className="onb3-t">
                  <b>{st.title}</b>
                  <small>{st.desc}</small>
                </span>
                <span className="onb3-radio" aria-hidden="true" />
              </label>
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="onb3-chips" role="group" aria-label="Áreas de interesse (várias opções)">
            {AREAS.map((area) => {
              const on = areas.includes(area.id)
              return (
                <button
                  key={area.id}
                  type="button"
                  className={'onb3-chip' + (on ? ' on' : '') + (area.open ? ' open' : '')}
                  aria-pressed={on}
                  onClick={() => toggle(areas, setAreas, area.id)}
                >
                  <Icon name={on ? 'Check' : area.icon} size={17} />
                  <span>{area.label}</span>
                </button>
              )
            })}
          </div>
        )}

        {step === 2 && (
          <div className="onb3-wants" role="group" aria-label="O que você quer conquistar (várias opções)">
            {WANTS.map((want) => {
              const on = wants.includes(want.id)
              return (
                <button
                  key={want.id}
                  type="button"
                  className={'onb3-want' + (on ? ' on' : '')}
                  aria-pressed={on}
                  onClick={() => toggle(wants, setWants, want.id)}
                >
                  <span className="onb3-ico">
                    <Icon name={want.icon} size={19} />
                  </span>
                  <span className="onb3-want-t">{want.label}</span>
                  <span className="onb3-box" aria-hidden="true">
                    <Icon name="Check" size={14} />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <p className={'onb3-hint' + ((step === 0 && !stage) || (step === 1 && !areas.length) ? '' : ' ok')} aria-live="polite">
          {hint}
        </p>
      </main>

      <footer className="onb-foot">
        {step > 0 ? (
          <Button variant="quiet" icon="ArrowLeft" disabled={saving} onClick={() => move(-1)}>
            Voltar
          </Button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <Button variant="primary" iconRight="ArrowRight" disabled={!canGo} onClick={() => move(1)}>
            Continuar
          </Button>
        ) : (
          <Button variant="primary" icon="Check" disabled={saving} onClick={finish}>
            Finalizar
          </Button>
        )}
      </footer>
    </div>
  )
}
