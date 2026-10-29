import { describe, expect, test } from 'vitest'
import { trailSchema } from '@/lib/admin/catalog-schema'
import { trailsFromRows } from '@/lib/domain/catalog-rows'
import { trailWithCourses } from '@/lib/domain/derive'
import { chooseableTrails, computeOnboarding, DEFAULT_TRAILS, findTrail, type Trail } from '@/lib/trails'
import { goalsPatchSchema } from '@/lib/validation'
import type { Catalog, Course } from '@/lib/types'

const course = (id: string, skills: string[], extra: Partial<Course> = {}) =>
  ({ id, title: 'Curso ' + id, skills, hidden: false, status: 'publicado', hours: 2, modules: [], ...extra }) as unknown as Course
const catalogOf = (courses: Course[], trails: Trail[]): Catalog => ({ courses, categories: [], trails })
const trail = (over: Partial<Trail> = {}): Trail => ({
  id: 'dados',
  icon: 'ChartColumn',
  title: 'Trabalhar com dados',
  blurb: '',
  skills: ['Dados'],
  keywords: ['dados'],
  courseIds: [],
  active: true,
  ...over,
})

describe('trilhas: leitura do banco', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'dados',
    title: 'Trabalhar com dados',
    blurb: 'x',
    icon: 'ChartColumn',
    skills: ['Dados'],
    keywords: ['dados'],
    course_ids: ['c2', 'c1'],
    position: 1,
    active: true,
    ...over,
  })

  test('sem a tabela (SQL ainda não rodou) valem as 7 trilhas de sempre', () => {
    expect(trailsFromRows(undefined)).toBe(DEFAULT_TRAILS)
    expect(DEFAULT_TRAILS).toHaveLength(7)
  })

  test('com a tabela: ordem do painel, cursos na ordem escolhida e ícone desconhecido vira o padrão', () => {
    const list = trailsFromRows([row({ id: 'b', position: 2, icon: 'Inexistente' }), row({ id: 'a', position: 0 })])
    expect(list.map((t) => t.id)).toEqual(['a', 'b'])
    expect(list[0].courseIds).toEqual(['c2', 'c1'])
    expect(list[1].icon).toBe('Rocket')
  })

  test('tabela vazia = nenhuma trilha (não volta para as de sempre); linha fora do formato é descartada', () => {
    expect(trailsFromRows([])).toEqual([])
    expect(trailsFromRows([row({ id: 'Maiúscula' }), row({ skills: 'não é lista' }), row()])).toHaveLength(1)
  })
})

describe('trilhas: cursos de cada uma', () => {
  const courses = [course('c1', ['Dados']), course('c2', ['Marketing']), course('c3', ['Dados', 'Marketing']), course('c4', ['Dados'], { hidden: true })]

  test('sem cursos escolhidos: os que ensinam as skills da trilha (mais combinações primeiro)', () => {
    const t = trailWithCourses(trail({ skills: ['Dados', 'Marketing'] }), catalogOf(courses, []))!
    expect(t.liveCourses.map((c) => c.id)).toEqual(['c3', 'c1', 'c2'])
  })

  test('com cursos escolhidos: só eles, na ordem escolhida, sem os que saíram do ar ou não existem mais', () => {
    const t = trailWithCourses(trail({ courseIds: ['c2', 'c4', 'sumiu', 'c1'] }), catalogOf(courses, []))!
    expect(t.liveCourses.map((c) => c.id)).toEqual(['c2', 'c1'])
  })
})

describe('trilhas: escolha e primeiro acesso', () => {
  test('findTrail acha a trilha (ativa ou não) e chooseableTrails só devolve as ativas', () => {
    const list = [trail(), trail({ id: 'off', title: 'Desativada', active: false })]
    expect(findTrail(list, 'off')?.title).toBe('Desativada')
    expect(findTrail(list, 'nao-existe')).toBeNull()
    expect(findTrail(list, null)).toBeNull()
    expect(chooseableTrails(list).map((t) => t.id)).toEqual(['dados'])
  })

  test('o primeiro acesso sugere a trilha da área escolhida', () => {
    const r = computeOnboarding({ stage: 'faculdade', areas: ['marketing'], wants: [] }, DEFAULT_TRAILS)!
    expect(r.primary).toBe('marketing')
    expect(r.text).toBe('Construir carreira em Marketing')
  })

  test('trilha excluída ou desativada não é sugerida: vale a próxima ou nenhuma', () => {
    const semMarketing = DEFAULT_TRAILS.filter((t) => t.id !== 'marketing')
    expect(computeOnboarding({ stage: 'faculdade', areas: ['marketing', 'vendas'], wants: [] }, semMarketing)!.primary).toBe('vendas')
    const desativada = DEFAULT_TRAILS.map((t) => (t.id === 'marketing' ? { ...t, active: false } : t))
    expect(computeOnboarding({ stage: 'faculdade', areas: ['marketing'], wants: [] }, desativada)!.primary).toBeNull()
    expect(computeOnboarding({ stage: 'faculdade', areas: ['marketing'], wants: [] }, [])!.primary).toBeNull()
  })
})

describe('trilhas: conferência dos dados', () => {
  const ok = { id: 'dados', title: 'Trabalhar com dados', blurb: '', icon: 'ChartColumn', skills: ['Dados'], keywords: [], courseIds: ['c1'], active: true }

  test('trilha do painel: formato certo passa; ícone, endereço e limites fora do formato não', () => {
    expect(trailSchema.safeParse(ok).success).toBe(true)
    expect(trailSchema.safeParse({ ...ok, icon: 'Inventado' }).success).toBe(false)
    expect(trailSchema.safeParse({ ...ok, id: 'Dados Ruins' }).success).toBe(false)
    expect(trailSchema.safeParse({ ...ok, skills: Array.from({ length: 11 }, (_, i) => 's' + i) }).success).toBe(false)
    expect(trailSchema.safeParse({ ...ok, courseIds: Array.from({ length: 13 }, (_, i) => 'c' + i) }).success).toBe(false)
  })

  test('objetivos do aluno: aceita o formato de um id de trilha (a existência é conferida no servidor)', () => {
    expect(goalsPatchSchema.safeParse({ primary: 'dados', secondary: ['marketing'] }).success).toBe(true)
    expect(goalsPatchSchema.safeParse({ primary: 'Dados!' }).success).toBe(false)
    expect(goalsPatchSchema.safeParse({ secondary: ['a', 'b', 'c'] }).success).toBe(false)
  })
})
