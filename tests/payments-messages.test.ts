import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { SAFE_ORDER_ERRORS } from '@/lib/payments/order'

/**
 * As mensagens que o banco escreve para a tela (erro FC422) só chegam ao aluno se estiverem em SAFE_ORDER_ERRORS.
 * Estes testes leem as migrations e garantem que a lista e o SQL andam juntos: mensagem nova no SQL sem entrar na
 * lista viraria "erro genérico" na tela, e mensagem na lista que não existe mais no SQL seria lixo.
 */

const dir = join(__dirname, '..', 'supabase', 'migrations')
const read = (name: string) => readFileSync(join(dir, name), 'utf8')

/** Mensagens literais de `raise exception '...' using errcode = 'FC422'` dentro de um trecho de SQL. */
const messages = (sql: string) => [...sql.matchAll(/raise exception '((?:[^']|'')+)'\s+using errcode = 'FC422'/g)].map((m) => m[1].replace(/''/g, "'"))

/** O corpo de uma função: do "create or replace function <nome>" até o "$$;" que a fecha. */
function body(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function ${name}(`)
  expect(start, name).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start) + 5))
}

const pagamentos = read('20261102000001_pagamentos.sql')
const transparente = read('20261102000003_pagamento_transparente.sql')

describe('mensagens do banco que vão para a tela', () => {
  test('toda mensagem FC422 de begin_payment_attempt está em SAFE_ORDER_ERRORS', () => {
    const found = messages(body(transparente, 'public.begin_payment_attempt'))
    expect(found.length).toBeGreaterThan(5)
    for (const message of found) expect(SAFE_ORDER_ERRORS, message).toContain(message)
  })

  test('toda mensagem FC422 de create_order está em SAFE_ORDER_ERRORS', () => {
    const found = messages(body(pagamentos, 'public.create_order'))
    expect(found.length).toBeGreaterThan(0)
    for (const message of found) expect(SAFE_ORDER_ERRORS, message).toContain(message)
  })

  test('toda mensagem da lista existe no SQL (nada esquecido para trás)', () => {
    const all = [...messages(pagamentos), ...messages(transparente)]
    for (const message of SAFE_ORDER_ERRORS) expect(all, message).toContain(message)
  })

  test('nenhuma mensagem da lista tem dado de pessoa, id ou texto técnico', () => {
    for (const message of SAFE_ORDER_ERRORS) {
      expect(message).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|@|select |insert |private\.|auth\./i)
      expect(message.length).toBeLessThan(160)
    }
  })
})
