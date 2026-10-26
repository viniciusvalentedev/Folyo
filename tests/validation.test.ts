import { describe, expect, it } from 'vitest'
import {
  cleanName,
  deleteAccountSchema,
  emailLinkSchema,
  emailSchema,
  fieldErrors,
  loginSchema,
  mfaCodeSchema,
  newPasswordSchema,
  normalizeWorkUrl,
  pdfUploadRequestSchema,
  resetPasswordSchema,
  safeUrl,
  signUpSchema,
  slugSchema,
  storedWorkSchema,
  urlSchema,
  workEditSchema,
  MAX_PDF_BYTES,
} from '@/lib/validation'

const UUID = '3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c'

describe('links', () => {
  it('urlSchema aceita só http(s)', () => {
    expect(urlSchema.safeParse('https://folyo.com').success).toBe(true)
    expect(urlSchema.safeParse('http://folyo.com').success).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'ftp://x.com', 'folyo.com', '']) {
      expect(urlSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('safeUrl devolve null para links perigosos', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl(null)).toBeNull()
    expect(safeUrl(undefined)).toBeNull()
    expect(safeUrl('https://ok.com')).toBe('https://ok.com')
  })

  it('normalizeWorkUrl completa https:// e exige domínio com ponto', () => {
    expect(normalizeWorkUrl('www.github.com/vini')).toEqual({ url: 'https://www.github.com/vini', host: 'github.com' })
    expect(normalizeWorkUrl('  site.com  ')).toMatchObject({ url: 'https://site.com/', host: 'site.com' })
    expect(normalizeWorkUrl('')).toHaveProperty('error')
    expect(normalizeWorkUrl('localhost')).toHaveProperty('error')
    expect(normalizeWorkUrl('javascript:alert(1)')).toHaveProperty('error')
    expect(normalizeWorkUrl('ftp://x.com')).toHaveProperty('error')
    expect(normalizeWorkUrl('https://a.com/' + 'x'.repeat(600))).toHaveProperty('error')
  })
})

describe('ids de URL', () => {
  it('slug só aceita minúsculas, números e hífen', () => {
    expect(slugSchema.safeParse('mkt-3').success).toBe(true)
    for (const bad of ['MKT', '../etc', 'a b', 'a_b', '', 'a'.repeat(65)]) {
      expect(slugSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('e-mail e senha', () => {
  it('e-mail é normalizado em minúsculas e sem espaços', () => {
    expect(emailSchema.parse('  Vini@Folyo.COM ')).toBe('vini@folyo.com')
    expect(emailSchema.safeParse('sem-arroba').success).toBe(false)
  })

  it('senha nova: de 8 a 72 caracteres', () => {
    expect(newPasswordSchema.safeParse('1234567').success).toBe(false)
    expect(newPasswordSchema.safeParse('12345678').success).toBe(true)
    expect(newPasswordSchema.safeParse('a'.repeat(72)).success).toBe(true)
    expect(newPasswordSchema.safeParse('a'.repeat(73)).success).toBe(false)
  })

  it('login não exige tamanho mínimo, só que haja senha', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true)
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false)
  })

  it('cadastro valida nome, e-mail e senha', () => {
    expect(signUpSchema.safeParse({ name: 'Vini', email: 'v@f.com', password: 'senha-forte-1' }).success).toBe(true)
    expect(signUpSchema.safeParse({ name: 'V', email: 'v@f.com', password: 'senha-forte-1' }).success).toBe(false)
  })

  it('redefinir senha exige confirmação igual', () => {
    const r = resetPasswordSchema.safeParse({ password: 'senha-forte-1', confirm: 'outra-coisa-1' })
    expect(r.success).toBe(false)
    if (!r.success) expect(fieldErrors(r.error)).toEqual({ confirm: 'As senhas não são iguais.' })
  })
})

describe('nomes (anti-personificação no histórico)', () => {
  it('remove caracteres invisíveis, de controle e o "·"', () => {
    expect(cleanName('Vi​ni')).toBe('Vini')
    expect(cleanName('Vini‮admin')).toBe('Viniadmin')
    expect(cleanName('Ana · Admin')).toBe('Ana Admin')
    expect(cleanName('Ana\u0000\u0007')).toBe('Ana')
    expect(cleanName('  Ana   Maria  ')).toBe('Ana Maria')
  })
})

describe('MFA e exclusão de conta', () => {
  it('código MFA aceita espaço ou traço, mas exige 6 números', () => {
    expect(mfaCodeSchema.parse({ code: '123 456' }).code).toBe('123456')
    expect(mfaCodeSchema.parse({ code: '123-456' }).code).toBe('123456')
    for (const bad of ['12345', '1234567', 'abcdef', '', '12 34 5a']) {
      expect(mfaCodeSchema.safeParse({ code: bad }).success).toBe(false)
    }
    expect(mfaCodeSchema.safeParse({}).success).toBe(false)
  })

  it('excluir conta exige a palavra EXCLUIR (sem diferenciar maiúsculas)', () => {
    expect(deleteAccountSchema.safeParse({ confirm: 'excluir' }).success).toBe(true)
    expect(deleteAccountSchema.safeParse({ confirm: '  EXCLUIR ' }).success).toBe(true)
    expect(deleteAccountSchema.safeParse({ confirm: 'sim' }).success).toBe(false)
    expect(deleteAccountSchema.safeParse({ confirm: '' }).success).toBe(false)
  })

  it('link do e-mail: token com formato seguro e tipo conhecido', () => {
    expect(emailLinkSchema.safeParse({ token_hash: 'abcDEF123_-xyz', type: 'recovery' }).success).toBe(true)
    expect(emailLinkSchema.safeParse({ token_hash: 'curto', type: 'recovery' }).success).toBe(false)
    expect(emailLinkSchema.safeParse({ token_hash: 'abc/../def12345', type: 'recovery' }).success).toBe(false)
    expect(emailLinkSchema.safeParse({ token_hash: 'abcDEF123456', type: 'magiclink' }).success).toBe(false)
  })
})

describe('trabalhos e PDFs', () => {
  const base = { id: UUID, courseId: null, title: 'Meu projeto', desc: '', public: false, inCV: false }

  it('link precisa de endereço; PDF não pode ter endereço', () => {
    expect(workEditSchema.safeParse({ ...base, kind: 'link', url: 'https://x.com' }).success).toBe(true)
    expect(workEditSchema.safeParse({ ...base, kind: 'link', url: null }).success).toBe(false)
    expect(workEditSchema.safeParse({ ...base, kind: 'pdf', url: 'https://x.com' }).success).toBe(false)
    expect(workEditSchema.safeParse({ ...base, kind: 'pdf', url: null }).success).toBe(true)
  })

  it('link com javascript: é recusado', () => {
    expect(workEditSchema.safeParse({ ...base, kind: 'link', url: 'javascript:alert(1)' }).success).toBe(false)
  })

  it('o que volta do banco com dados misturados é descartado', () => {
    const file = { name: 'a.pdf', size: 1000 }
    expect(storedWorkSchema.safeParse({ ...base, kind: 'pdf', url: null, file }).success).toBe(true)
    expect(storedWorkSchema.safeParse({ ...base, kind: 'pdf', url: null, file: null }).success).toBe(false)
    expect(storedWorkSchema.safeParse({ ...base, kind: 'link', url: 'https://x.com', file }).success).toBe(false)
    expect(storedWorkSchema.safeParse({ ...base, kind: 'pdf', url: null, file: { name: 'a.pdf', size: MAX_PDF_BYTES + 1 } }).success).toBe(false)
  })

  it('pedido de envio de PDF respeita o limite de 20 MB', () => {
    expect(pdfUploadRequestSchema.safeParse({ size: 1000 }).success).toBe(true)
    expect(pdfUploadRequestSchema.safeParse({ size: MAX_PDF_BYTES }).success).toBe(true)
    expect(pdfUploadRequestSchema.safeParse({ size: MAX_PDF_BYTES + 1 }).success).toBe(false)
    expect(pdfUploadRequestSchema.safeParse({ size: 4 }).success).toBe(false)
    expect(pdfUploadRequestSchema.safeParse({ size: 1.5 }).success).toBe(false)
  })
})
