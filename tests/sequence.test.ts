import { describe, expect, test } from 'vitest'
import { blockingIndex, followsSequence } from '@/lib/domain/sequence'

const lessons = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => ({ id }))
const doneOf = (...ids: string[]) => (id: string) => ids.includes(id)

describe('blockingIndex (aulas em sequência)', () => {
  test('a primeira aula está sempre liberada', () => {
    expect(blockingIndex(lessons, 0, doneOf())).toBe(-1)
  })
  test('a aula 4 só abre com as aulas 1, 2 e 3 concluídas', () => {
    expect(blockingIndex(lessons, 3, doneOf())).toBe(0)
    expect(blockingIndex(lessons, 3, doneOf('a1'))).toBe(1)
    expect(blockingIndex(lessons, 3, doneOf('a1', 'a2'))).toBe(2)
    expect(blockingIndex(lessons, 3, doneOf('a1', 'a2', 'a3'))).toBe(-1)
  })
  test('a próxima aula depois da última concluída está liberada; a seguinte não', () => {
    const done = doneOf('a1', 'a2')
    expect(blockingIndex(lessons, 2, done)).toBe(-1)
    expect(blockingIndex(lessons, 3, done)).toBe(2)
  })
  test('aula já concluída continua aberta, mesmo se uma anterior foi desmarcada', () => {
    expect(blockingIndex(lessons, 2, doneOf('a1', 'a3'))).toBe(-1)
  })
  test('aula fora da lista não trava', () => {
    expect(blockingIndex(lessons, -1, doneOf())).toBe(-1)
    expect(blockingIndex(lessons, 9, doneOf())).toBe(-1)
  })
})

describe('followsSequence', () => {
  test('só o aluno segue a sequência; a equipe abre qualquer aula', () => {
    expect(followsSequence('aluno')).toBe(true)
    expect(followsSequence('editor')).toBe(false)
    expect(followsSequence('admin')).toBe(false)
    expect(followsSequence('proprietario')).toBe(false)
  })
})
