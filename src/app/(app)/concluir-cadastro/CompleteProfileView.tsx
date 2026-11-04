'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition, type CSSProperties, type FormEvent } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { useApp } from '@/components/providers/AppState'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { savePersonalDataAction } from '@/lib/actions/personal'
import { formatPhoneBR } from '@/lib/format'
import { ageOn, formatBirthDate, GENDERS, genderLabel, maskBirthDate, todayBR, type Gender } from '@/lib/personal-data'
import { formatAccountPhone } from '@/lib/phone'
import type { PersonalData } from '@/lib/types'
import { accountPhoneSchema, birthDateSchema } from '@/lib/validation'

const STEPS = [
  {
    eyebrow: 'Contato',
    title: 'Qual é o seu celular?',
    lead: 'Para falarmos com você sobre a sua conta e as suas compras. Só o Brasil, com DDD.',
  },
  {
    eyebrow: 'Sobre você',
    title: 'Quando você nasceu?',
    lead: 'Ajuda a gente a montar cursos e conteúdos pensando em quem estuda na Folyo.',
  },
  {
    eyebrow: 'Sobre você',
    title: 'Como você se identifica?',
    lead: 'Usamos só em números gerais, sem identificar ninguém. Se preferir, é só não informar.',
  },
] as const

const GENDER_ICONS: Record<Gender, IconName> = {
  feminino: 'User',
  masculino: 'User',
  nao_informar: 'EyeOff',
}

/** Confete do final: posição e cor de cada pedacinho (fixos, para o desenho ser o mesmo no servidor e na tela). */
const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2
  const far = 90 + ((i * 37) % 60)
  return {
    x: Math.round(Math.cos(angle) * far),
    y: Math.round(Math.sin(angle) * far),
    r: (i * 47) % 360,
    c: ['var(--lime)', 'var(--magenta)', 'var(--blue)'][i % 3],
    d: (i % 6) * 30,
  }
})

/**
 * Concluir cadastro em 3 passos (celular, nascimento, gênero) e uma tela de "pronto".
 * Cada passo confere o que foi digitado (zod) antes de seguir; tudo é gravado só no final, de uma vez, pela ação
 * savePersonalDataAction (que o banco confere de novo). Nada disso aparece no perfil público.
 */
export function CompleteProfileView() {
  const { s, a, toast } = useApp()
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [phone, setPhone] = useState('')
  const [news, setNews] = useState(false)
  const [birth, setBirth] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState<PersonalData | null>(null)
  const [saving, startSaving] = useTransition()
  const title = useRef<HTMLHeadingElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.scrollTo(0, 0)
    // Nos passos com campo, o foco vai direto para o campo; no de opções, para o título.
    if (step < 2 && !done) input.current?.focus({ preventScroll: true })
    else title.current?.focus({ preventScroll: true })
  }, [step, done])

  const phoneCheck = accountPhoneSchema.safeParse(phone)
  const birthCheck = birthDateSchema.safeParse(birth)
  const phoneOk = phoneCheck.success
  const birthOk = birthCheck.success
  const age = birthOk ? ageOn(birthCheck.data, todayBR()) : null

  const move = (by: -1 | 1) => {
    setError('')
    setDir(by)
    setStep(step + by)
  }

  const next = (e?: FormEvent) => {
    e?.preventDefault()
    if (saving) return
    if (step === 0) {
      if (!phoneOk) return setError(phoneCheck.error.issues[0]?.message ?? 'Confira o celular.')
      return move(1)
    }
    if (step === 1) {
      if (!birthOk) return setError(birthCheck.error.issues[0]?.message ?? 'Confira a data.')
      return move(1)
    }
    finish()
  }

  const finish = () => {
    if (!phoneOk || !birthOk || !gender) {
      setError('Escolha uma das opções para concluir.')
      return
    }
    // Vai como foi digitado ("(35) 99876-5432", "25/08/2001"): o servidor confere e converte de novo.
    const payload = { phone, birthDate: birth, gender, whatsappNews: news }
    startSaving(async () => {
      const result = await savePersonalDataAction(payload)
      if (!result.ok || !result.data) {
        const message = result.ok ? 'Não foi possível salvar agora. Tente de novo em instantes.' : result.error
        setError(message)
        toast(message, 'err')
        return
      }
      const saved = { ...result.data, whatsappNews: news }
      a.setPersonal(saved)
      setDone(saved)
    })
  }

  if (done) return <Done data={done} first={s.user.first} titleRef={title} />

  const copy = STEPS[step]
  const canGo = step === 0 ? phoneOk : step === 1 ? birthOk : !!gender

  return (
    <div className="onb cc surface-paper">
      <header className="onb-top">
        <Wordmark height={34} tone="indigo" text="var(--ink)" />
        <div className="onb-steps" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1} aria-label={`Passo ${step + 1} de 3`}>
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />
          ))}
          <small>Passo {step + 1} de 3</small>
        </div>
      </header>

      <form id="cc-form" className="onb-main onb3-main cc-main" key={step} style={{ '--dir': dir } as CSSProperties} onSubmit={next} noValidate>
        <p className="eyebrow">{step === 0 ? `Falta pouco, ${s.user.first}` : copy.eyebrow}</p>
        <h1 ref={title} tabIndex={-1} className="onb-title">
          {copy.title}
        </h1>
        <p className="lead onb3-lead">{copy.lead}</p>

        {step === 0 && (
          <>
            <label className={'cc-field' + (phoneOk ? ' ok' : '') + (error ? ' bad' : '')}>
              <span className="cc-field-ico" aria-hidden="true">
                <Icon name="Smartphone" size={20} />
              </span>
              <span className="sr-only">Celular com DDD</span>
              <input
                ref={input}
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                maxLength={20}
                placeholder="(35) 99876-5432"
                value={phone}
                onChange={(e) => {
                  setPhone(formatPhoneBR(e.target.value))
                  setError('')
                }}
                aria-invalid={!!error}
                aria-describedby="cc-msg"
              />
              <span className="cc-field-ok" aria-hidden="true">
                <Icon name="Check" size={16} />
              </span>
            </label>
            <label className={'cc-opt' + (news ? ' on' : '')}>
              <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} />
              <span className="onb3-ico" aria-hidden="true">
                <Icon name="MessageCircle" size={19} />
              </span>
              <span className="cc-opt-t">
                <b>Quero novidades pelo WhatsApp</b>
                <small>Cursos novos e avisos importantes. Opcional: dá para desligar quando quiser em Configurações.</small>
              </span>
              <span className="onb3-box" aria-hidden="true">
                <Icon name="Check" size={14} />
              </span>
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <label className={'cc-field' + (birthOk ? ' ok' : '') + (error ? ' bad' : '')}>
              <span className="cc-field-ico" aria-hidden="true">
                <Icon name="Cake" size={20} />
              </span>
              <span className="sr-only">Data de nascimento (dia, mês e ano)</span>
              <input
                ref={input}
                inputMode="numeric"
                autoComplete="bday"
                maxLength={10}
                placeholder="DD/MM/AAAA"
                value={birth}
                onChange={(e) => {
                  setBirth(maskBirthDate(e.target.value))
                  setError('')
                }}
                aria-invalid={!!error}
                aria-describedby="cc-msg"
              />
              <span className="cc-field-ok" aria-hidden="true">
                <Icon name="Check" size={16} />
              </span>
            </label>
            <p className="cc-age" aria-live="polite">
              {age !== null && (
                <span key={age}>
                  <Icon name="PartyPopper" size={15} /> {age} {age === 1 ? 'ano' : 'anos'}
                </span>
              )}
            </p>
          </>
        )}

        {step === 2 && (
          <div className="cc-genders" role="radiogroup" aria-label="Gênero">
            {GENDERS.map((g, i) => (
              <label
                key={g.id}
                className={'onb3-card cc-gender' + (gender === g.id ? ' on' : '') + (g.id === 'nao_informar' ? ' quiet' : '')}
                style={{ '--i': i } as CSSProperties}
              >
                <input
                  type="radio"
                  name="cc-gender"
                  value={g.id}
                  checked={gender === g.id}
                  onChange={() => {
                    setGender(g.id)
                    setError('')
                  }}
                />
                <span className="onb3-ico">
                  <Icon name={GENDER_ICONS[g.id]} size={19} />
                </span>
                <span className="onb3-t">
                  <b>{g.label}</b>
                </span>
                <span className="onb3-radio" aria-hidden="true" />
              </label>
            ))}
          </div>
        )}

        <p id="cc-msg" className={'cc-msg' + (error ? ' err' : '')} role={error ? 'alert' : undefined}>
          {error ? (
            <>
              <Icon name="CircleAlert" size={14} /> {error}
            </>
          ) : (
            <>
              <Icon name="ShieldCheck" size={14} /> Só você e a Folyo veem. Nunca aparece no seu perfil público.
            </>
          )}
        </p>
      </form>

      <footer className="onb-foot">
        {step > 0 ? (
          <Button variant="quiet" icon="ArrowLeft" disabled={saving} onClick={() => move(-1)}>
            Voltar
          </Button>
        ) : (
          <Link href="/inicio" className="cc-later">
            Fazer depois
          </Link>
        )}
        {step < 2 ? (
          <Button type="submit" form="cc-form" variant="primary" iconRight="ArrowRight" aria-disabled={!canGo}>
            Continuar
          </Button>
        ) : (
          <Button type="submit" form="cc-form" variant="primary" icon="Check" disabled={saving} aria-disabled={!canGo}>
            {saving ? 'Salvando…' : 'Concluir cadastro'}
          </Button>
        )}
      </footer>
    </div>
  )
}

/** Tela final: selo animado, confete e o resumo do que foi salvo. */
function Done({ data, first, titleRef }: { data: PersonalData; first: string; titleRef: React.RefObject<HTMLHeadingElement | null> }) {
  const rows: { icon: IconName; label: string; value: string }[] = [
    { icon: 'Smartphone', label: 'Celular', value: formatAccountPhone(data.phone) },
    { icon: 'Cake', label: 'Nascimento', value: formatBirthDate(data.birthDate) },
    { icon: 'User', label: 'Gênero', value: genderLabel(data.gender) },
    { icon: 'MessageCircle', label: 'WhatsApp', value: data.whatsappNews ? 'Quero novidades' : 'Sem novidades' },
  ]
  return (
    <div className="onb cc surface-paper">
      <header className="onb-top">
        <Wordmark height={34} tone="indigo" text="var(--ink)" />
        <div className="onb-steps" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="done" />
          ))}
        </div>
      </header>
      <main className="cc-done">
        <div className="cc-badge" aria-hidden="true">
          {CONFETTI.map((p, i) => (
            <i
              key={i}
              style={{ '--x': `${p.x}px`, '--y': `${p.y}px`, '--r': `${p.r}deg`, '--c': p.c, '--d': `${p.d}ms` } as CSSProperties}
            />
          ))}
          <svg viewBox="0 0 96 96" width="96" height="96">
            <circle className="cc-badge-ring" cx="48" cy="48" r="44" />
            <path className="cc-badge-check" d="M30 49 l12 12 l24 -26" />
          </svg>
        </div>
        <p className="eyebrow">Cadastro concluído</p>
        <h1 ref={titleRef} tabIndex={-1} className="onb-title">
          Tudo certo, {first}!
        </h1>
        <p className="lead onb3-lead">Seus dados ficam guardados com segurança. Dá para mudar quando quiser em Configurações.</p>
        <dl className="cc-summary">
          {rows.map((r, i) => (
            <div key={r.label} style={{ '--i': i } as CSSProperties}>
              <dt>
                <Icon name={r.icon} size={15} /> {r.label}
              </dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="cc-done-actions">
          <ButtonLink href="/inicio" variant="primary" iconRight="ArrowRight">
            Ir para o início
          </ButtonLink>
          <ButtonLink href="/configuracoes" variant="quiet" icon="Settings">
            Ver em Configurações
          </ButtonLink>
        </div>
      </main>
    </div>
  )
}
