import { describe, expect, it } from 'vitest'
import { previewState } from '@/lib/domain/preview-state'
import {
  ageOn,
  birthDateInRange,
  COMPLETE_PROFILE_NOTICE_ID,
  COMPLETE_PROFILE_PATH,
  formatBirthDate,
  maskBirthDate,
  parseBirthDate,
  todayBR,
} from '@/lib/personal-data'
import { formatAccountPhone, normalizeAccountPhone } from '@/lib/phone'
import type { Catalog } from '@/lib/types'
import { accountPhoneSchema, birthDateSchema, personalDataInputSchema, signUpSchema, storedPersonalDataSchema } from '@/lib/validation'

describe('cadastro (signUp) continua igual', () => {
  it('pede só nome, e-mail e senha, e não leva celular junto', () => {
    const r = signUpSchema.safeParse({ name: 'Vini', email: 'v@f.com', password: 'senha-forte-1', phone: '35998765432' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data).not.toHaveProperty('phone')
  })
})

describe('celular da conta', () => {
  it('aceita os jeitos comuns de digitar e guarda como +55', () => {
    for (const [input, out] of [
      ['(35) 99876-5432', '+5535998765432'],
      ['35 99876 5432', '+5535998765432'],
      ['+55 (35) 99876-5432', '+5535998765432'],
      ['5535998765432', '+5535998765432'],
      ['055 35 99876-5432', '+5535998765432'],
      ['(11) 3322-4455', '+551133224455'],
    ]) {
      expect(normalizeAccountPhone(input)).toBe(out)
      expect(accountPhoneSchema.safeParse(input).data).toBe(out)
    }
  })

  it('recusa sem DDD, DDD que não existe, outro país e tamanho errado', () => {
    for (const bad of ['', '99876-5432', '(10) 99876-5432', '(20) 99876-5432', '(35) 89876-5432', '(35) 6876-5432', '+1 555 123 4567', '(35) 99876-54321', '3'.repeat(40)]) {
      expect(normalizeAccountPhone(bad)).toBeNull()
      expect(accountPhoneSchema.safeParse(bad).success).toBe(false)
    }
    expect(formatAccountPhone('+5535998765432')).toBe('(35) 99876-5432')
    expect(formatAccountPhone('')).toBe('')
  })
})

describe('data de nascimento', () => {
  it('máscara e conversão', () => {
    expect(maskBirthDate('25082001')).toBe('25/08/2001')
    expect(maskBirthDate('25/0')).toBe('25/0')
    expect(maskBirthDate('2508200199')).toBe('25/08/2001')
    expect(parseBirthDate('25/08/2001')).toBe('2001-08-25')
    expect(formatBirthDate('2001-08-25')).toBe('25/08/2001')
    expect(formatBirthDate('')).toBe('')
  })

  it('recusa datas que não existem', () => {
    for (const bad of ['31/02/2001', '29/02/2001', '00/01/2001', '12/13/2001', '1/1/2001', '2001-08-25', 'abc']) {
      expect(parseBirthDate(bad)).toBeNull()
      expect(birthDateSchema.safeParse(bad).success).toBe(false)
    }
    expect(parseBirthDate('29/02/2004')).toBe('2004-02-29')
  })

  it('idade completa, contando o aniversário', () => {
    expect(ageOn('2001-08-25', '2026-08-24')).toBe(24)
    expect(ageOn('2001-08-25', '2026-08-25')).toBe(25)
    expect(ageOn('2004-02-29', '2026-02-28')).toBe(21)
    expect(ageOn('2004-02-29', '2026-03-01')).toBe(22)
  })

  it('idade entre 10 e 120 anos (igual ao banco)', () => {
    const today = '2026-11-04'
    expect(birthDateInRange('2016-11-04', today)).toBe(true)
    expect(birthDateInRange('2016-11-05', today)).toBe(false)
    expect(birthDateInRange('1905-11-05', today)).toBe(true)
    expect(birthDateInRange('1905-11-04', today)).toBe(false)
    expect(birthDateInRange('2030-01-01', today)).toBe(false)
  })

  it('hoje no fuso do Brasil', () => {
    // 02:00 UTC do dia 5 ainda é dia 4 em São Paulo.
    expect(todayBR(new Date('2026-11-05T02:00:00Z'))).toBe('2026-11-04')
  })
})

describe('gravação do cadastro completo', () => {
  const ok = { phone: '(35) 99876-5432', birthDate: '25/08/2001', gender: 'feminino' }

  it('valida os três juntos e converte para o formato guardado', () => {
    expect(personalDataInputSchema.parse(ok)).toEqual({ phone: '+5535998765432', birthDate: '2001-08-25', gender: 'feminino' })
    expect(personalDataInputSchema.parse({ ...ok, whatsappNews: true }).whatsappNews).toBe(true)
  })

  it('recusa campo faltando, gênero fora da lista e aceite que não é sim/não', () => {
    expect(personalDataInputSchema.safeParse({ ...ok, phone: '' }).success).toBe(false)
    expect(personalDataInputSchema.safeParse({ ...ok, birthDate: '' }).success).toBe(false)
    expect(personalDataInputSchema.safeParse({ ...ok, gender: 'Feminino' }).success).toBe(false)
    expect(personalDataInputSchema.safeParse({ ...ok, gender: undefined }).success).toBe(false)
    expect(personalDataInputSchema.safeParse({ ...ok, whatsappNews: 'on' }).success).toBe(false)
  })

  it('confere o que vem do banco antes de ir para a tela', () => {
    expect(storedPersonalDataSchema.safeParse({ phone: '+5535998765432', birthDate: '2001-08-25', gender: 'outro', whatsappNews: false }).success).toBe(true)
    expect(storedPersonalDataSchema.safeParse({ phone: '35998765432', birthDate: '2001-08-25', gender: 'outro', whatsappNews: false }).success).toBe(false)
    expect(storedPersonalDataSchema.safeParse({ phone: '+5535998765432', birthDate: '2001-08-25', gender: 'x', whatsappNews: false }).success).toBe(false)
  })
})

describe('aviso "Conclua seu cadastro" no sino', () => {
  const catalog = { categories: [], courses: [], trails: [] } as unknown as Catalog
  const base = previewState(catalog, false)

  it('aparece (não lido) para quem ainda não concluiu e leva à tela certa', () => {
    const notice = base.notifications.find((n) => n.id === COMPLETE_PROFILE_NOTICE_ID)
    expect(notice).toMatchObject({ to: COMPLETE_PROFILE_PATH, read: false })
    expect(base.notifications[0].id).toBe(COMPLETE_PROFILE_NOTICE_ID)
    expect(base.personal).toBeNull()
  })

  it('some para quem já concluiu, e o aceite do WhatsApp vem junto', () => {
    const rowsDone = { phone: '+5535998765432', birthDate: '2001-08-25', gender: 'feminino' as const, whatsappNews: true }
    // Mesmo caminho do servidor: o estado é montado a partir das linhas do banco.
    const state = previewState(catalog, false, rowsDone)
    expect(state.notifications.some((n) => n.id === COMPLETE_PROFILE_NOTICE_ID)).toBe(false)
    expect(state.personal).toEqual(rowsDone)
    expect(state.settings.whatsappNews).toBe(true)
  })
})
