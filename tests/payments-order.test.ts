import { describe, expect, test } from 'vitest'
import {
  declineMessage,
  formatCpf,
  hostOf,
  isMercadoPagoHost,
  isMercadoPagoOrigin,
  isThreeDsUrl,
  isValidCpf,
  myOrderSchema,
  onlyDigits,
  orderStatusSchema,
  payInputSchema,
} from '@/lib/payments/order'

const ORDER = '3f2b8c1e-6a4d-4e0b-9c53-7d1a2b3c4d5e'
const CPF = '529.982.247-25'
const card = { method: 'cartao', orderId: ORDER, token: 'ff8080814c11e237014c1ff593b57b4d', paymentMethodId: 'visa', installments: 3, cpf: CPF, deviceId: 'device-abc-12345' }

describe('CPF', () => {
  test.each(['529.982.247-25', '52998224725', '111.444.777-35', ' 529 982 247 25 '])('aceita %j', (cpf) => expect(isValidCpf(cpf)).toBe(true))

  test.each(['', '123', '529.982.247-24', '111.111.111-11', '000.000.000-00', '12345678900', '5299822472', '529982247256', 'abc', '529.982.247-2x', '99999999999'])(
    'recusa %j',
    (cpf) => expect(isValidCpf(cpf)).toBe(false),
  )

  test('formata enquanto digita e limpa o que não é número', () => {
    expect(formatCpf('5')).toBe('5')
    expect(formatCpf('5299')).toBe('529.9')
    expect(formatCpf('529982')).toBe('529.982')
    expect(formatCpf('5299822')).toBe('529.982.2')
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    expect(formatCpf('529982247259999')).toBe('529.982.247-25')
    expect(formatCpf('a5b2c9')).toBe('529')
    expect(onlyDigits('529.982.247-25')).toBe('52998224725')
  })
})

describe('payInputSchema (o que o navegador pode mandar para pagar)', () => {
  test('cartão válido: o CPF vai só com dígitos', () => {
    const r = payInputSchema.safeParse(card)
    expect(r.success).toBe(true)
    if (r.success && r.data.method === 'cartao') {
      expect(r.data.cpf).toBe('52998224725')
      expect(r.data.installments).toBe(3)
    }
  })

  test('Pix válido; sem id do dispositivo também vale', () => {
    expect(payInputSchema.safeParse({ method: 'pix', orderId: ORDER, cpf: CPF }).success).toBe(true)
    expect(payInputSchema.safeParse({ method: 'pix', orderId: ORDER, cpf: CPF, deviceId: 'device-abc-12345' }).success).toBe(true)
  })

  test('valor, total, itens e qualquer campo extra mandados pelo navegador são descartados', () => {
    const r = payInputSchema.safeParse({ ...card, amount: 0.01, totalCents: 1, total_amount: '0.01', items: [{ price: 1 }], email: 'outro@x.com', status: 'approved' })
    expect(r.success).toBe(true)
    expect(Object.keys(r.success ? r.data : {}).sort()).toEqual(['cpf', 'deviceId', 'installments', 'method', 'orderId', 'paymentMethodId', 'token'])
  })

  test.each([
    ['forma desconhecida', { ...card, method: 'boleto' }],
    ['sem forma', { orderId: ORDER, cpf: CPF }],
    ['pedido que não é id', { ...card, orderId: '1; drop table orders' }],
    ['CPF inválido', { ...card, cpf: '111.111.111-11' }],
    ['CPF enorme', { ...card, cpf: '5'.repeat(500) }],
    ['token curto', { ...card, token: 'abc' }],
    ['token com símbolo', { ...card, token: 'ff8080814c11e237014c1ff593b57b4d<script>' }],
    ['token enorme', { ...card, token: 'a'.repeat(200) }],
    ['bandeira com maiúsculas e símbolos', { ...card, paymentMethodId: 'VISA;--' }],
    ['0 parcelas', { ...card, installments: 0 }],
    ['13 parcelas', { ...card, installments: 13 }],
    ['parcelas negativas', { ...card, installments: -1 }],
    ['parcelas fracionadas', { ...card, installments: 2.5 }],
    ['parcelas em texto', { ...card, installments: '3' }],
    ['dispositivo com símbolo', { ...card, deviceId: 'a b<c>' }],
    ['cartão sem token', { ...card, token: undefined }],
    ['nada', undefined],
    ['texto', 'cartao'],
  ])('recusa: %s', (_name, input) => expect(payInputSchema.safeParse(input).success).toBe(false))
})

describe('declineMessage', () => {
  test('traduz os códigos conhecidos para frases', () => {
    expect(declineMessage('rejected_by_issuer')).toMatch(/banco/)
    expect(declineMessage('insufficient_amount')).toMatch(/limite/)
    expect(declineMessage('bad_filled_card_data')).toMatch(/dados do cartão/)
    expect(declineMessage('high_risk')).toMatch(/segurança/)
    expect(declineMessage('3ds_challenge_expired')).toMatch(/demorou/)
    expect(declineMessage('3ds_challenge_failed')).toMatch(/confirmação com o banco/)
  })

  test('código desconhecido, vazio ou malicioso vira a frase padrão (nunca o código cru)', () => {
    for (const code of [undefined, null, '', 'xyz', '__proto__', 'constructor', 'toString', 'hasOwnProperty', '<script>']) {
      const message = declineMessage(code)
      expect(message, String(code)).toBe('O pagamento não foi aprovado. Nada foi cobrado. Tente outro cartão ou pague com Pix.')
    }
  })
})

describe('endereços do Mercado Pago', () => {
  test.each([
    'https://www.mercadopago.com.br/3ds/abc?x=1',
    'https://api.mercadopago.com/v1/3ds',
    'https://secure.mercadolibre.com/x',
    'https://http2.mlstatic.com/a.js',
    'https://www.mercadolivre.com.br/a',
    'https://www.mercadolivre.com/jms/mlb/lgz/fingerprint/medium/armor.png',
  ])('3D Secure aceita %s', (url) => expect(isThreeDsUrl(url)).toBe(true))

  test.each([
    'http://www.mercadopago.com.br/x',
    'https://mercadopago.com.br.evil.com/x',
    'https://evilmercadopago.com/x',
    'https://www.mercadopago.com@evil.com/x',
    'https://user:pass@www.mercadopago.com/x',
    'https://evil.com/mercadopago.com/',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'https://www.mercadopago.com/a b',
    'https://www.mercadopago.com/' + 'a'.repeat(2100),
    '',
    null,
    42,
  ])('3D Secure recusa %j', (url) => expect(isThreeDsUrl(url)).toBe(false))

  test('origem de mensagem do iframe: só domínios do Mercado Pago', () => {
    expect(isMercadoPagoOrigin('https://www.mercadopago.com.br')).toBe(true)
    expect(isMercadoPagoOrigin('https://api.mercadopago.com')).toBe(true)
    expect(isMercadoPagoOrigin('http://www.mercadopago.com.br')).toBe(false)
    expect(isMercadoPagoOrigin('https://mercadopago.com.evil.com')).toBe(false)
    expect(isMercadoPagoOrigin('null')).toBe(false)
    expect(isMercadoPagoOrigin('')).toBe(false)
    expect(isMercadoPagoHost(null)).toBe(false)
  })

  test('hostOf só devolve o servidor (para o log, sem token do endereço)', () => {
    expect(hostOf('https://www.mercadopago.com/3ds?token=SEGREDO')).toBe('www.mercadopago.com')
    expect(hostOf('não é endereço')).toBe('invalido')
    expect(hostOf('http://x.com')).toBe('invalido')
  })
})

describe('respostas do banco', () => {
  const item = { courseId: 'mkt', title: 'Marketing', priceCents: 3299 }

  test('order_status: aceita pedido sem tentativa, com Pix em aberto e com recusa', () => {
    const base = { status: 'pendente', totalCents: 3299, paidAt: null, expiresAt: '2026-11-04T15:00:00Z', items: [item] }
    expect(orderStatusSchema.safeParse({ ...base, attempt: null }).success).toBe(true)
    const pix = { code: 'x'.repeat(40), qrBase64: null, ticketUrl: null, expiresAt: null }
    expect(orderStatusSchema.safeParse({ ...base, attempt: { method: 'pix', status: 'aguardando_pix', statusDetail: 'waiting_transfer', open: true, pix } }).success).toBe(true)
    expect(orderStatusSchema.safeParse({ ...base, attempt: { method: 'cartao', status: 'recusado', statusDetail: 'rejected_by_issuer', open: false, pix: null } }).success).toBe(true)
  })

  test('order_status: estado ou forma de pagamento desconhecidos são recusados', () => {
    const base = { status: 'pendente', totalCents: 3299, paidAt: null, expiresAt: '2026-11-04T15:00:00Z', items: [item] }
    expect(orderStatusSchema.safeParse({ ...base, attempt: { method: 'boleto', status: 'recusado', statusDetail: null, open: false, pix: null } }).success).toBe(false)
    expect(orderStatusSchema.safeParse({ ...base, attempt: { method: 'pix', status: 'hackeado', statusDetail: null, open: false, pix: null } }).success).toBe(false)
    expect(orderStatusSchema.safeParse({ ...base, status: 'qualquer' }).success).toBe(false)
  })

  test('my_orders: aceita com e sem pagamento em andamento e não carrega link de pagamento', () => {
    const base = { id: ORDER, status: 'pendente', totalCents: 3299, createdAt: '2026-11-02T15:00:00Z', paidAt: null, refundedAt: null, items: [item] }
    expect(myOrderSchema.safeParse({ ...base, payment: null }).success).toBe(true)
    const r = myOrderSchema.safeParse({ ...base, payment: { method: 'pix', status: 'aguardando_pix', until: '2026-11-02T16:00:00Z' }, checkoutUrl: 'https://evil.example' })
    expect(r.success).toBe(true)
    expect(r.success && 'checkoutUrl' in r.data).toBe(false)
  })
})
