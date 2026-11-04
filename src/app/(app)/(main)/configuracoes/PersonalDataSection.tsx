'use client'

import { useState, useTransition } from 'react'
import { useApp } from '@/components/providers/AppState'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Field, Select } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { savePersonalDataAction } from '@/lib/actions/personal'
import { formatPhoneBR } from '@/lib/format'
import { COMPLETE_PROFILE_PATH, formatBirthDate, GENDERS, maskBirthDate, type Gender } from '@/lib/personal-data'
import { formatAccountPhone } from '@/lib/phone'
import { accountPhoneSchema, birthDateSchema } from '@/lib/validation'

/**
 * Configurações → Dados pessoais: celular da conta, data de nascimento e gênero (o cadastro completo).
 * Quem ainda não concluiu vê o convite para a tela "Concluir cadastro". Gravado pela ação própria
 * (savePersonalDataAction), que o banco confere de novo; só a própria pessoa vê esses dados.
 */
export function PersonalDataSection() {
  const { s, a, toast } = useApp()
  const saved = s.personal
  const [phone, setPhone] = useState(formatAccountPhone(saved?.phone))
  const [birth, setBirth] = useState(formatBirthDate(saved?.birthDate))
  const [gender, setGender] = useState<Gender | ''>(saved?.gender ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, startSaving] = useTransition()

  if (!saved) {
    return (
      <section className="set-sec cc-settings-invite">
        <span className="cc-settings-ico" aria-hidden="true">
          <Icon name="UserCheck" size={22} />
        </span>
        <div>
          <h2>Conclua seu cadastro</h2>
          <p className="muted">Falta informar seu celular, sua data de nascimento e seu gênero. Leva menos de um minuto.</p>
        </div>
        <ButtonLink href={COMPLETE_PROFILE_PATH} iconRight="ArrowRight">
          Concluir cadastro
        </ButtonLink>
      </section>
    )
  }

  const save = () => {
    const p = accountPhoneSchema.safeParse(phone)
    const b = birthDateSchema.safeParse(birth)
    const next: Record<string, string> = {}
    if (!p.success) next.phone = p.error.issues[0]?.message ?? 'Celular inválido.'
    if (!b.success) next.birth = b.error.issues[0]?.message ?? 'Data inválida.'
    if (!gender) next.gender = 'Escolha uma das opções.'
    setErrors(next)
    if (!p.success || !b.success || !gender) return
    startSaving(async () => {
      // Vai como foi digitado: o servidor confere e converte de novo (celular +55..., data AAAA-MM-DD).
      const result = await savePersonalDataAction({ phone, birthDate: birth, gender })
      if (!result.ok || !result.data) {
        toast(result.ok ? 'Não foi possível salvar agora.' : result.error, 'err')
        return
      }
      a.setPersonal({ ...result.data, whatsappNews: s.settings.whatsappNews })
      toast('Cadastro atualizado.', 'ok')
    })
  }

  return (
    <section className="set-sec">
      <div>
        <h2>Cadastro</h2>
        <p className="muted small cc-settings-lead">
          <Icon name="Lock" size={13} /> Só você e a Folyo veem estes dados (o celular é para falarmos sobre a sua conta e as compras). Nunca aparecem no perfil público nem no currículo.
        </p>
      </div>
      <div className="grid-form">
        <Field label="Celular da conta" id="st-account-phone" error={errors.phone}>
          <input
            id="st-account-phone"
            type="tel"
            inputMode="tel"
            className="inp"
            maxLength={20}
            autoComplete="tel-national"
            placeholder="(35) 99876-5432"
            value={phone}
            onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
            aria-invalid={!!errors.phone}
          />
        </Field>
        <Field label="Data de nascimento" id="st-birth" error={errors.birth}>
          <input
            id="st-birth"
            inputMode="numeric"
            className="inp"
            maxLength={10}
            autoComplete="bday"
            placeholder="DD/MM/AAAA"
            value={birth}
            onChange={(e) => setBirth(maskBirthDate(e.target.value))}
            aria-invalid={!!errors.birth}
          />
        </Field>
        <Field label="Gênero" id="st-gender" error={errors.gender}>
          <Select<Gender | ''>
            id="st-gender"
            label="Gênero"
            value={gender}
            onChange={setGender}
            options={[...(gender ? [] : [{ value: '' as const, label: 'Escolha…' }]), ...GENDERS.map((g) => ({ value: g.id, label: g.label }))]}
          />
        </Field>
      </div>
      <div className="row gap-s">
        <Button icon="Check" onClick={save} disabled={saving}>
          {saving ? 'Salvando…' : 'Salvar cadastro'}
        </Button>
      </div>
    </section>
  )
}
