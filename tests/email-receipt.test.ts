import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildReceiptEmail, esc, firstName, longDate, orderNumber, receiptSchema, type ReceiptData } from '@/lib/email/receipt'
import { emailConfig, sendEmail, sendOrderReceipt } from '@/lib/email/send'

const smtp = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: smtp.createTransport } }))

/**
 * E-mail de recibo: conteúdo (escape, links, singular/plural), envio (SMTP da Zoho simulado, sem rede) e o fluxo de reserva
 * (o banco só entrega o recibo uma vez; falha devolve a reserva).
 */

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const SITE = 'https://www.usefolyo.com'
const SUPPORT = 'contato@usefolyo.com'

const receipt = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  orderId: ORDER,
  email: 'ana@exemplo.com',
  name: 'Ana Souza',
  totalCents: 8289,
  paidAt: '2026-11-02T15:30:00.000Z',
  items: [
    { courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 3299 },
    { courseId: 'design', title: 'Design Gráfico', priceCents: 4990 },
  ],
  ...over,
})
const build = (data = receipt()) => buildReceiptEmail(data, { siteUrl: SITE, supportEmail: SUPPORT })

describe('conteúdo do recibo', () => {
  test('agradece, mostra pedido, itens, total e leva ao site', () => {
    const m = build()
    expect(m.subject).toBe('Pagamento confirmado: seus cursos estão liberados')
    for (const body of [m.html, m.text]) {
      expect(body).toContain('Obrigado pela compra, Ana!')
      expect(body).toContain('3F2B8C1E')
      expect(body).toContain('2 de novembro de 2026')
      expect(body).toContain('Marketing Estratégico')
      expect(body).toContain('Design Gráfico')
      expect(body).toContain(`${SITE}/cursos/mkt`)
      expect(body).toContain(`${SITE}/cursos/design`)
      expect(body).toContain(`${SITE}/compras`)
      expect(body).toContain(`${SITE}/termos`)
    }
    // R$ 82,89 (o Intl usa espaço não separável depois do R$).
    expect(m.html.replace(/ /g, ' ')).toContain('R$ 82,89')
    expect(m.text.replace(/ /g, ' ')).toContain('Total pago: R$ 82,89')
  })

  test('um curso só: o botão abre o curso, no singular', () => {
    const m = build(receipt({ items: [{ courseId: 'mkt', title: 'Marketing Estratégico', priceCents: 3299 }], totalCents: 3299 }))
    expect(m.subject).toBe('Pagamento confirmado: seu curso está liberado')
    expect(m.html).toContain('Acessar meu curso')
    expect(m.html).toContain(`href="${SITE}/cursos/mkt" style="display:inline-block`)
    expect(m.text).toContain(`Acessar meu curso: ${SITE}/cursos/mkt`)
  })

  test('vários cursos: o botão abre "Minhas compras"', () => {
    const m = build()
    expect(m.html).toContain(`href="${SITE}/compras" style="display:inline-block`)
    expect(m.text).toContain(`Acessar meus cursos: ${SITE}/compras`)
  })

  test('sem nome, o cumprimento é genérico', () => {
    expect(build(receipt({ name: null })).html).toContain('Obrigado pela compra!')
    expect(build(receipt({ name: '   ' })).html).toContain('Obrigado pela compra!')
  })

  test('texto vindo de fora é escapado: nada vira HTML nem quebra o atributo', () => {
    const m = build(
      receipt({
        name: '<img src=x onerror=alert(1)> Ana',
        items: [{ courseId: 'mkt', title: '"><script>alert(1)</script> Curso & Cia', priceCents: 3299 }],
        totalCents: 3299,
      }),
    )
    expect(m.html).not.toContain('<script>')
    expect(m.html).not.toContain('<img')
    expect(m.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Curso &amp; Cia')
  })

  test('id de curso estranho não vira link (cai em "Minhas compras")', () => {
    const m = build(receipt({ items: [{ courseId: 'x"><a href="https://evil.example">', title: 'Curso', priceCents: 1000 }], totalCents: 1000 }))
    expect(m.html).not.toContain('evil.example')
    expect(m.html).toContain(`href="${SITE}/compras" style="display:inline-block`)
  })

  test('o recibo não leva dado de pagamento', () => {
    const m = build()
    expect(m.html + m.text).not.toMatch(/cart[aã]o|token|payment|pagamento id|secret/i)
  })

  test('endereço do site com barra no fim não duplica a barra', () => {
    const m = buildReceiptEmail(receipt(), { siteUrl: SITE + '/', supportEmail: SUPPORT })
    expect(m.text).toContain(`${SITE}/compras`)
    expect(m.text).not.toContain('//compras')
  })

  test('auxiliares', () => {
    expect(esc(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
    expect(orderNumber(ORDER)).toBe('3F2B8C1E')
    expect(firstName('  Maria   da Silva ')).toBe('Maria')
    expect(firstName('')).toBeNull()
    expect(firstName(null)).toBeNull()
    expect(longDate('2026-11-03T01:30:00.000Z')).toBe('2 de novembro de 2026') // ainda é dia 2 em Brasília
    expect(longDate('lixo')).toBe('')
    expect(longDate(null)).toBe('')
  })

  test('o esquema recusa dado malformado do banco', () => {
    expect(receiptSchema.safeParse(receipt()).success).toBe(true)
    expect(receiptSchema.safeParse({ ...receipt(), email: 'nao-e-email' }).success).toBe(false)
    expect(receiptSchema.safeParse({ ...receipt(), items: [] }).success).toBe(false)
    expect(receiptSchema.safeParse({ ...receipt(), orderId: 'x' }).success).toBe(false)
  })
})

const SMTP_ENV = { SMTP_HOST: 'smtp.zoho.com', SMTP_USER: 'contato@usefolyo.com', SMTP_PASSWORD: 'senha-secreta-de-teste', EMAIL_FROM: 'Folyo <contato@usefolyo.com>' }
const stubSmtp = (over: Record<string, string> = {}) => {
  for (const [k, v] of Object.entries({ ...SMTP_ENV, ...over })) vi.stubEnv(k, v)
}
const CFG = { host: 'smtp.zoho.com', port: 465, user: 'contato@usefolyo.com', password: 'senha-secreta-de-teste', from: 'Folyo <contato@usefolyo.com>' }

function resetSmtp() {
  smtp.sendMail.mockReset().mockResolvedValue({ messageId: 'x' })
  smtp.close.mockReset()
  smtp.createTransport.mockReset().mockReturnValue({ sendMail: smtp.sendMail, close: smtp.close })
}

describe('envio (SMTP da Zoho)', () => {
  beforeEach(() => {
    resetSmtp()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  test('sem as variáveis (ou com dado inválido) não há configuração', () => {
    expect(emailConfig()).toBeNull()
    stubSmtp({ SMTP_PASSWORD: '' })
    expect(emailConfig()).toBeNull()
    vi.unstubAllEnvs()
    stubSmtp({ EMAIL_FROM: 'Folyo <contato@usefolyo.com>\r\nBcc: x@y.z' })
    expect(emailConfig()).toBeNull()
    vi.unstubAllEnvs()
    stubSmtp({ SMTP_HOST: 'smtp.zoho.com; rm -rf /' })
    expect(emailConfig()).toBeNull()
    vi.unstubAllEnvs()
    stubSmtp({ SMTP_PORT: '99999' })
    expect(emailConfig()).toBeNull()
    vi.unstubAllEnvs()
    stubSmtp({ SMTP_PORT: 'abc' })
    expect(emailConfig()).toBeNull()
  })

  test('com tudo preenchido: porta 465 por padrão', () => {
    stubSmtp()
    expect(emailConfig()).toEqual(CFG)
    vi.unstubAllEnvs()
    stubSmtp({ SMTP_PORT: '587', EMAIL_FROM: 'contato@usefolyo.com' })
    expect(emailConfig()).toMatchObject({ port: 587, from: 'contato@usefolyo.com' })
  })

  test('manda para um único destinatário, com conexão criptografada e fecha a conexão', async () => {
    await sendEmail(CFG, { ...build(), to: 'ana@exemplo.com', replyTo: SUPPORT })
    const opts = smtp.createTransport.mock.calls[0][0]
    expect(opts).toMatchObject({ host: 'smtp.zoho.com', port: 465, secure: true, requireTLS: false, auth: { user: 'contato@usefolyo.com', pass: 'senha-secreta-de-teste' } })
    expect(opts.tls.minVersion).toBe('TLSv1.2')
    expect(opts.connectionTimeout).toBeGreaterThan(0)
    expect(smtp.sendMail).toHaveBeenCalledTimes(1)
    const mail = smtp.sendMail.mock.calls[0][0]
    expect(mail.to).toBe('ana@exemplo.com')
    expect(mail.from).toBe('Folyo <contato@usefolyo.com>')
    expect(mail.replyTo).toBe(SUPPORT)
    expect(mail.subject).toContain('Pagamento confirmado')
    expect(mail.html).toContain('<html')
    expect(mail.text).toContain('Pedido')
    expect(smtp.close).toHaveBeenCalledTimes(1)
  })

  test.each(['ana@exemplo.com\r\nBcc: x@y.z', 'ana@exemplo.com, x@y.z', 'ana@exemplo.com;x@y.z', '"x" <x@y.z>', 'sem-arroba'])('destinatário suspeito (%j) nunca é enviado', async (to) => {
    await expect(sendEmail(CFG, { ...build(), to })).rejects.toThrow('Destinatário inválido')
    expect(smtp.createTransport).not.toHaveBeenCalled()
    expect(smtp.sendMail).not.toHaveBeenCalled()
  })

  test('porta 587: exige STARTTLS (nunca manda a senha sem criptografia)', async () => {
    await sendEmail({ ...CFG, port: 587 }, { ...build(), to: 'ana@exemplo.com' })
    expect(smtp.createTransport.mock.calls[0][0]).toMatchObject({ port: 587, secure: false, requireTLS: true })
  })

  test('falha do servidor vira erro sem senha nem endereço, e a conexão é fechada', async () => {
    smtp.sendMail.mockRejectedValue(Object.assign(new Error('550 ana@exemplo.com senha-secreta-de-teste'), { responseCode: 550 }))
    const err = await sendEmail(CFG, { ...build(), to: 'ana@exemplo.com' }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).not.toMatch(/senha-secreta|ana@exemplo/)
    expect((err as { status?: number }).status).toBe(550)
    expect(smtp.close).toHaveBeenCalledTimes(1)
  })

  test('sem rede: erro genérico', async () => {
    smtp.sendMail.mockRejectedValue(new Error('ECONNRESET senha-secreta-de-teste'))
    const err = await sendEmail(CFG, { ...build(), to: 'ana@exemplo.com' }).catch((e: Error) => e)
    expect((err as Error).message).not.toContain('senha-secreta')
    expect((err as { status?: number }).status).toBeUndefined()
  })
})

describe('sendOrderReceipt (reserva no banco)', () => {
  const rpc = vi.fn()
  const supabase = { rpc } as unknown as Parameters<typeof sendOrderReceipt>[0]
  beforeEach(() => {
    stubSmtp()
    resetSmtp()
    rpc.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  const claimTo = (data: unknown) =>
    rpc.mockImplementation(async (fn: string) => (fn === 'claim_order_receipt' ? { data, error: null } : { data: null, error: null }))

  test('sem configuração de e-mail: nem reserva nem envia', async () => {
    vi.stubEnv('SMTP_PASSWORD', '')
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('sem_configuracao')
    expect(rpc).not.toHaveBeenCalled()
    expect(smtp.sendMail).not.toHaveBeenCalled()
  })

  test('nada a enviar (já enviado, não pago ou outro envio em andamento): não manda e-mail', async () => {
    claimTo(null)
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('nada_a_enviar')
    expect(smtp.sendMail).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  test('sucesso: envia uma vez e fecha a reserva como enviado', async () => {
    claimTo(receipt())
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('enviado')
    expect(smtp.sendMail).toHaveBeenCalledTimes(1)
    expect(smtp.sendMail.mock.calls[0][0].to).toBe('ana@exemplo.com')
    expect(rpc).toHaveBeenLastCalledWith('finish_order_receipt', { p_order: ORDER, p_sent: true })
  })

  test('falha no envio: devolve a reserva (não enviado) e não lança erro', async () => {
    claimTo(receipt())
    smtp.sendMail.mockRejectedValue(new Error('boom'))
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('falhou')
    expect(rpc).toHaveBeenLastCalledWith('finish_order_receipt', { p_order: ORDER, p_sent: false })
  })

  test('dados do banco malformados: não envia e devolve a reserva', async () => {
    claimTo({ orderId: ORDER, email: 'invalido' })
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('falhou')
    expect(smtp.sendMail).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenLastCalledWith('finish_order_receipt', { p_order: ORDER, p_sent: false })
  })

  test('SQL do recibo ainda não rodado (PGRST202): segue sem e-mail e sem barulho', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('falhou')
    expect(smtp.sendMail).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  test('erro do banco ao reservar: não envia', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } })
    expect(await sendOrderReceipt(supabase, ORDER)).toBe('falhou')
    expect(smtp.sendMail).not.toHaveBeenCalled()
  })

  test('nada sensível vai para os logs (senha, endereço da pessoa)', async () => {
    claimTo(receipt())
    smtp.sendMail.mockRejectedValue(Object.assign(new Error('535 senha-secreta-de-teste ana@exemplo.com'), { responseCode: 535 }))
    await sendOrderReceipt(supabase, ORDER)
    const logged = JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls])
    expect(logged).not.toContain('senha-secreta')
    expect(logged).not.toContain('ana@exemplo.com')
  })
})
