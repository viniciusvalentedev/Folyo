import { describe, expect, test } from 'vitest'
import { verifyMercadoPagoSignature } from '@/lib/payments/signature'

/**
 * Assinatura do webhook do Mercado Pago. Os cabeçalhos abaixo foram aceitos pelo validador do SDK OFICIAL
 * (mercadopago@3.6.1, WebhookSignatureValidator.validate) com esta chave: se o Mercado Pago mudar o formato,
 * é aqui que isso aparece.
 */
const SECRET = 'segredo-de-teste-folyo'

const CASES = [
  { name: 'com id e request-id', dataId: '123456789', requestId: 'req-abc-123', header: 'ts=1704908010,v1=7a675ce77828b8263d052218295e1e45725e7236736b617d70f17bf63403b4f7' },
  {
    name: 'request-id em formato uuid',
    dataId: '987654321',
    requestId: 'f0e1d2c3-b4a5-9687-7869-5a4b3c2d1e0f',
    header: 'ts=1793600000,v1=289161b72aa52eea9fbfaa70bbe00b6808446b07c4186b2d88444c10377d38f6',
  },
  { name: 'sem data.id (peça fica de fora)', dataId: null, requestId: 'req-sem-id', header: 'ts=1704908010,v1=1dae92940b118f5cc16934789b2bcd2b057aee544298209e0010ba7e6511c1ab' },
  { name: 'sem request-id (peça fica de fora)', dataId: '555', requestId: null, header: 'ts=1704908010,v1=f238b88d59eab5943b91cbf01c2b71ed63ca9d9aad157e8f741596e42521e0f4' },
] as const

describe('assinatura do webhook do Mercado Pago', () => {
  test.each(CASES)('aceita a assinatura certa: $name', ({ dataId, requestId, header }) => {
    expect(verifyMercadoPagoSignature({ xSignature: header, xRequestId: requestId, dataId, secret: SECRET })).toEqual({ ok: true })
  })

  test('aceita espaços e ordem diferente no cabeçalho', () => {
    const c = CASES[0]
    const v1 = c.header.split('v1=')[1]
    expect(verifyMercadoPagoSignature({ xSignature: ` v1=${v1} , ts=1704908010 `, xRequestId: c.requestId, dataId: c.dataId, secret: SECRET })).toEqual({ ok: true })
  })

  test.each(CASES)('recusa chave errada: $name', ({ dataId, requestId, header }) => {
    expect(verifyMercadoPagoSignature({ xSignature: header, xRequestId: requestId, dataId, secret: 'outra-chave' })).toEqual({ ok: false, reason: 'assinatura_diferente' })
  })

  test('recusa se o id do pagamento foi trocado', () => {
    const c = CASES[0]
    expect(verifyMercadoPagoSignature({ xSignature: c.header, xRequestId: c.requestId, dataId: '123456780', secret: SECRET }).ok).toBe(false)
  })

  test('recusa se o request-id foi trocado ou removido', () => {
    const c = CASES[0]
    expect(verifyMercadoPagoSignature({ xSignature: c.header, xRequestId: 'req-outro', dataId: c.dataId, secret: SECRET }).ok).toBe(false)
    expect(verifyMercadoPagoSignature({ xSignature: c.header, xRequestId: null, dataId: c.dataId, secret: SECRET }).ok).toBe(false)
  })

  test('recusa se o ts foi trocado', () => {
    const c = CASES[0]
    const forged = c.header.replace('ts=1704908010', 'ts=1704908011')
    expect(verifyMercadoPagoSignature({ xSignature: forged, xRequestId: c.requestId, dataId: c.dataId, secret: SECRET }).ok).toBe(false)
  })

  test('recusa hash adulterado, truncado ou em branco', () => {
    const c = CASES[0]
    const v1 = c.header.split('v1=')[1]
    for (const bad of [v1.replace(/.$/, v1.endsWith('0') ? '1' : '0'), v1.slice(0, -2), v1 + '00', v1.toUpperCase()]) {
      expect(verifyMercadoPagoSignature({ xSignature: `ts=1704908010,v1=${bad}`, xRequestId: c.requestId, dataId: c.dataId, secret: SECRET }).ok).toBe(false)
    }
  })

  test.each([
    [null, 'sem_cabecalho'],
    [undefined, 'sem_cabecalho'],
    ['   ', 'sem_cabecalho'],
    ['lixo', 'cabecalho_invalido'],
    ['v1=abc', 'cabecalho_invalido'],
    ['ts=abc,v1=def', 'cabecalho_invalido'],
    ['ts=123', 'sem_assinatura'],
    ['ts=123,v2=abc', 'sem_assinatura'],
  ] as const)('cabeçalho %j é recusado (%s)', (header, reason) => {
    expect(verifyMercadoPagoSignature({ xSignature: header, xRequestId: 'r', dataId: '1', secret: SECRET })).toEqual({ ok: false, reason })
  })

  test('sem chave configurada nada passa (nem com assinatura "certa" para chave vazia)', () => {
    expect(verifyMercadoPagoSignature({ xSignature: CASES[0].header, xRequestId: 'req-abc-123', dataId: '123456789', secret: '' })).toEqual({ ok: false, reason: 'sem_chave' })
    expect(verifyMercadoPagoSignature({ xSignature: CASES[0].header, xRequestId: 'req-abc-123', dataId: '123456789', secret: undefined })).toEqual({ ok: false, reason: 'sem_chave' })
  })
})
