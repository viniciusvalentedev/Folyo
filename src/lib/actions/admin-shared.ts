import 'server-only'
import { FAILED, type ActionResult } from './shared'

/**
 * Peças comuns das ações do painel (só servidor). Ficam fora dos arquivos 'use server'
 * porque tudo o que é exportado de lá vira um endereço público.
 */

export const TOO_MANY = { ok: false, error: 'Muitas ações seguidas. Espere um minuto e tente de novo.' } as const satisfies ActionResult
export const ADMIN_RATE = { max: 60, windowMs: 60_000 }

type DbError = { code?: string; message?: string }
export type AdminFailure = { ok: false; error: string; code?: string }

/**
 * Mensagens que o próprio banco escreve (códigos FA...) podem ir para a tela.
 * O `code` volta junto para a tela poder reagir (ex.: FA409 = curso alterado por outra pessoa).
 */
export function fromDb(where: string, userId: string, error: DbError): AdminFailure {
  if (error.code === 'FY429') return TOO_MANY
  if (error.code && /^FA[0-9]{3}$/.test(error.code) && error.message) {
    // Tentativa barrada pelo banco: fica no log do servidor (Vercel → Logs) para dar para investigar.
    if (error.code === 'FA403') console.warn('Painel: ação negada', { where, userId })
    return { ok: false, error: error.message, code: error.code }
  }
  console.error('Falha no painel', { where, code: error.code })
  return FAILED
}
