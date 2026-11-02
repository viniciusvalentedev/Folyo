import { describe, expect, test } from 'vitest'
import { mapGatewayStatus } from '@/lib/payments/status'

describe('mapGatewayStatus', () => {
  test.each([
    ['processed', 'accredited', 'aprovado', 'approved'],
    ['processed', 'partially_refunded', 'aprovado', 'approved'],
    ['PROCESSED', 'ACCREDITED', 'aprovado', 'approved'],
    ['refunded', 'refunded', 'reembolsado', 'refunded'],
    ['refunded', null, 'reembolsado', 'refunded'],
    ['charged_back', 'in_process', 'reembolsado', 'charged_back'],
    ['action_required', 'pending_challenge', 'aguardando_acao', null],
    ['action_required', 'waiting_transfer', 'aguardando_pix', null],
    ['action_required', null, 'aguardando_acao', null],
    ['processing', 'in_process', 'processando', null],
    ['created', null, 'processando', null],
    ['failed', 'rejected_by_issuer', 'recusado', null],
    ['failed', 'cc_rejected_3ds_challenge', 'recusado', null],
    ['canceled', 'canceled', 'cancelado', null],
    ['cancelled', null, 'cancelado', null],
    ['expired', 'expired', 'expirado', null],
  ])('%s/%s → %s (aplica: %s)', (status, detail, state, apply) => {
    expect(mapGatewayStatus(status, detail)).toEqual({ state, apply })
  })

  test('só "processed" com detalhe conhecido libera: o resto de "processed" não libera nada', () => {
    for (const detail of [null, undefined, '', 'in_process', 'pending', 'qualquer_coisa', 'accredited_depois']) {
      expect(mapGatewayStatus('processed', detail), String(detail)).toEqual({ state: null, apply: null })
    }
  })

  test('estado desconhecido ou vazio não muda nada', () => {
    for (const status of [null, undefined, '', 'aprovado', 'approved', 'rejected', 'xyz', '__proto__', 'constructor']) {
      expect(mapGatewayStatus(status, 'accredited'), String(status)).toEqual({ state: null, apply: null })
    }
  })

  test('nenhum estado de falha, espera ou cancelamento chega a aplicar liberação', () => {
    for (const status of ['failed', 'action_required', 'processing', 'created', 'canceled', 'expired']) {
      for (const detail of ['accredited', 'partially_refunded', null]) expect(mapGatewayStatus(status, detail).apply, `${status}/${detail}`).toBeNull()
    }
  })
})
