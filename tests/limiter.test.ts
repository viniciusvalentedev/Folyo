import { describe, expect, it } from 'vitest'
import { createLimiter } from '@/lib/security/limiter'

const rule = { max: 3, windowMs: 1000 }

describe('limitador em memória', () => {
  it('permite até o máximo e bloqueia depois', () => {
    const l = createLimiter()
    expect([1, 2, 3, 4, 5].map(() => l.allow('ip', rule, 0))).toEqual([true, true, true, false, false])
  })

  it('cada chave tem a sua contagem', () => {
    const l = createLimiter()
    for (let i = 0; i < 5; i++) l.allow('a', rule, 0)
    expect(l.allow('b', rule, 0)).toBe(true)
  })

  it('a janela reinicia depois do tempo', () => {
    const l = createLimiter()
    for (let i = 0; i < 5; i++) l.allow('ip', rule, 0)
    expect(l.allow('ip', rule, 999)).toBe(false)
    expect(l.allow('ip', rule, 1000)).toBe(true)
  })

  it('limited só olha e não conta', () => {
    const l = createLimiter()
    l.hit('ip', rule, 0)
    l.hit('ip', rule, 0)
    expect(l.limited('ip', rule, 0)).toBe(false)
    expect(l.limited('ip', rule, 0)).toBe(false)
    l.hit('ip', rule, 0)
    expect(l.limited('ip', rule, 0)).toBe(true)
    expect(l.limited('ip', rule, 1000)).toBe(false)
  })

  it('reset zera a contagem (login certo)', () => {
    const l = createLimiter()
    for (let i = 0; i < 3; i++) l.hit('ip', rule, 0)
    expect(l.limited('ip', rule, 0)).toBe(true)
    l.reset('ip')
    expect(l.limited('ip', rule, 0)).toBe(false)
  })

  it('não cresce sem limite quando chegam muitos IPs diferentes', () => {
    const l = createLimiter()
    for (let i = 0; i < 25_000; i++) l.hit('ip' + i, rule, 0)
    // o mais antigo foi descartado para dar lugar aos novos; os recentes continuam contando
    expect(l.limited('ip0', rule, 0)).toBe(false)
    for (let i = 0; i < 2; i++) l.hit('ip24999', rule, 0)
    expect(l.limited('ip24999', rule, 0)).toBe(true)
  })
})
