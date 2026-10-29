import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPublicPath } from '@/lib/auth/redirects'
import { deriveUserData } from '@/lib/domain/derive'
import { previewState } from '@/lib/domain/preview-state'
import {
  normalizeSlug,
  parsePublicProfile,
  portfolioFromState,
  publicPdfUrl,
  publicProfileUrl,
  RESERVED_SLUGS,
  slugProblem,
  suggestSlug,
} from '@/lib/public-profile'
import type { Catalog, Course, Work } from '@/lib/types'

describe('endereço do perfil (slug)', () => {
  it.each([
    ['Vinícius Valente', 'vinicius-valente'],
    ['  Maria   da Silva!! ', 'maria-da-silva'],
    ['JOÃO_123', 'joao-123'],
    ['---ana---', 'ana'],
    ['ç ã é', 'c-a-e'],
    ['', ''],
    ['😀😀', ''],
  ])('normaliza %j -> %j', (raw, want) => {
    expect(normalizeSlug(raw)).toBe(want)
  })

  it('corta em 30 letras sem deixar hífen no fim', () => {
    const slug = normalizeSlug('a'.repeat(29) + ' bbbbbb')
    expect(slug.length).toBeLessThanOrEqual(30)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('aceita endereços bons e explica os ruins', () => {
    expect(slugProblem('maria-silva')).toBeNull()
    expect(slugProblem('abc')).toBeNull()
    expect(slugProblem('a1-b2-c3')).toBeNull()
    expect(slugProblem('')).toMatch(/Escolha/)
    expect(slugProblem('ab')).toMatch(/pelo menos 3/)
    expect(slugProblem('Maria')).toMatch(/minúsculas/)
    expect(slugProblem('maria silva')).toMatch(/minúsculas/)
    expect(slugProblem('a--b')).toMatch(/minúsculas/)
    expect(slugProblem('-ab')).toMatch(/minúsculas/)
    expect(slugProblem('a'.repeat(31))).toMatch(/minúsculas/)
    expect(slugProblem('../etc/passwd')).not.toBeNull()
  })

  it('bloqueia nomes reservados (rotas do site e marca)', () => {
    for (const reserved of ['admin', 'api', 'folyo', 'usefolyo', 'entrar', 'cursos', 'publico']) {
      expect(slugProblem(reserved), reserved).toMatch(/reservado/)
    }
  })

  it('a lista de reservados do site é a mesma do banco', () => {
    const sql = readFileSync(join(__dirname, '../supabase/migrations/20261028000001_perfil_publico.sql'), 'utf8')
    const block = /reserved_slugs\(\)[\s\S]*?array\[([\s\S]*?)\]/.exec(sql)![1]
    const inSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(inSql).toEqual([...RESERVED_SLUGS].sort())
  })

  it('todo reservado tem formato válido (a lista não tem lixo) e nenhuma rota do site fica de fora', () => {
    for (const r of RESERVED_SLUGS) expect(r).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const route of ['admin', 'api', 'aula', 'auth', 'certificados', 'competencias', 'configuracoes', 'curriculo', 'cursos', 'entrar', 'inicio', 'objetivos', 'perfil', 'primeiro-acesso', 'privacidade', 'progresso', 'projetos', 'publico', 'redefinir-senha', 'seguranca', 'termos']) {
      expect(RESERVED_SLUGS, route).toContain(route)
    }
  })

  it('sugere um endereço a partir do nome, ou nada se não der', () => {
    expect(suggestSlug('Maria da Silva')).toBe('maria-da-silva')
    expect(suggestSlug('Al')).toBe('')
    expect(suggestSlug('Admin')).toBe('')
  })

  it('monta os endereços públicos', () => {
    expect(publicProfileUrl('maria')).toMatch(/\/u\/maria$/)
    expect(publicPdfUrl('maria', 'abc')).toBe('/api/u/maria/trabalhos/abc')
    expect(publicPdfUrl('maria', 'abc', true)).toBe('/api/u/maria/trabalhos/abc?download=1')
  })

  it('/u abre sem login; o resto da área do aluno continua fechado', () => {
    expect(isPublicPath('/u/maria')).toBe(true)
    expect(isPublicPath('/u')).toBe(true)
    expect(isPublicPath('/api/u/maria/trabalhos/3f1b2c4d-0000-4000-8000-000000000002')).toBe(true)
    expect(isPublicPath('/usuarios')).toBe(false)
    expect(isPublicPath('/api/usuarios')).toBe(false)
    expect(isPublicPath('/publico')).toBe(false)
    expect(isPublicPath('/api/trabalhos/x/arquivo')).toBe(false)
    expect(isPublicPath('/api/materiais/x')).toBe(false)
    expect(isPublicPath('/api/admin/midia/x')).toBe(false)
  })
})

const ID = '3f1b2c4d-0000-4000-8000-000000000001'
const payload = {
  name: '  Maria Silva ',
  headline: 'Analista',
  bio: 'Sobre mim',
  city: 'Poços de Caldas',
  goal: 'Quero crescer em dados',
  email: null,
  experiences: [{ id: 'e1', role: 'Analista', org: 'Acme', period: '2024' }],
  courses: [
    { id: 'mkt', title: 'Marketing', hours: 8, tone: 'lime', glyph: 'm', complete: true, completed_at: '2026-10-20T15:00:00Z', certified: true },
    { id: 'vendas', title: 'Vendas', hours: 4, tone: 'estranho', glyph: 'v', complete: false, completed_at: null, certified: true },
  ],
  works: [
    { id: ID, course_id: 'mkt', kind: 'link', title: 'Meu site', description: '', url: 'https://exemplo.com.br/x', file_name: null, file_size: null, created_at: '2026-10-21T10:00:00Z' },
    { id: '3f1b2c4d-0000-4000-8000-000000000002', course_id: 'curso-que-sumiu', kind: 'pdf', title: 'Relatório', description: 'PDF', url: null, file_name: 'r.pdf', file_size: 2048, created_at: '2026-10-22T10:00:00Z' },
  ],
}

describe('parsePublicProfile (resposta do banco)', () => {
  it('monta o portfólio', () => {
    const p = parsePublicProfile(payload)!
    expect(p.name).toBe('Maria Silva')
    expect(p.email).toBe('')
    expect(p.courses.map((c) => [c.id, c.complete, c.certified, c.completedAt])).toEqual([
      ['mkt', true, true, '2026-10-20'],
      ['vendas', false, false, null],
    ])
    expect(p.courses[1].tone).toBe('blue')
    expect(p.works).toHaveLength(2)
  })

  it('trabalho de curso que não veio na lista vira "fora da Folyo"', () => {
    const p = parsePublicProfile(payload)!
    expect(p.works.find((w) => w.kind === 'pdf')!.courseId).toBeNull()
    expect(p.works.find((w) => w.kind === 'link')!.courseId).toBe('mkt')
  })

  it('descarta trabalho estragado ou com endereço perigoso, sem derrubar a página', () => {
    const bad = {
      ...payload,
      works: [
        ...payload.works,
        { ...payload.works[0], id: '3f1b2c4d-0000-4000-8000-000000000003', url: 'javascript:alert(1)' },
        { ...payload.works[0], id: 'não-é-uuid' },
        { ...payload.works[1], id: '3f1b2c4d-0000-4000-8000-000000000004', url: 'https://x.com' },
        null,
        'texto',
        42,
      ],
    }
    expect(parsePublicProfile(bad)!.works.map((w) => w.title)).toEqual(['Meu site', 'Relatório'])
  })

  it('perfil sem nome ou resposta fora do formato = não existe', () => {
    expect(parsePublicProfile({ ...payload, name: '   ' })).toBeNull()
    expect(parsePublicProfile(null)).toBeNull()
    expect(parsePublicProfile('oi')).toBeNull()
    expect(parsePublicProfile({})).toBeNull()
  })

  it('só mostra o e-mail que o banco liberou e corta textos longos', () => {
    const p = parsePublicProfile({ ...payload, email: 'maria@exemplo.com', bio: 'x'.repeat(5000) })!
    expect(p.email).toBe('maria@exemplo.com')
    expect(p.bio.length).toBe(1200)
  })
})

describe('portfolioFromState (pré-visualização = página pública)', () => {
  const course = {
    id: 'mkt', title: 'Marketing', cat: 'x', level: 'Iniciante', hours: 8, tone: 'lime', glyph: 'm', plan: 'free', featured: false,
    summary: '', outcomes: [], skills: [], project: { title: '', brief: '', expected: '' },
    modules: [{ id: 'm1', title: 'M', lessons: [{ id: 'a1', title: 'A', min: 5 }] }],
  } as Course
  const catalog: Catalog = { courses: [course], categories: [] }
  const work = (over: Partial<Work>): Work => ({
    id: ID, courseId: null, kind: 'link', title: 'Meu site', desc: '', url: 'https://exemplo.com', file: null,
    public: true, inCV: false, createdAt: '2026-10-20T10:00:00Z', updatedAt: '2026-10-20T10:00:00Z', ...over,
  })

  it('respeita "projetos no portfólio público" e "mostrar e-mail"', () => {
    const s = previewState(catalog, false)
    s.user.email = 'maria@exemplo.com'
    s.works = [work({}), work({ id: '2', public: false, title: 'Privado' })]
    s.settings.publicPortfolio = false
    s.settings.showEmail = false
    let p = portfolioFromState(s, deriveUserData(s, catalog), catalog)
    expect(p.works).toEqual([])
    expect(p.email).toBe('')
    s.settings.publicPortfolio = true
    s.settings.showEmail = true
    p = portfolioFromState(s, deriveUserData(s, catalog), catalog)
    expect(p.works.map((w) => w.title)).toEqual(['Meu site'])
    expect(p.email).toBe('maria@exemplo.com')
  })

  it('lista cursos concluídos e os dos trabalhos públicos', () => {
    const s = previewState(catalog, false)
    s.settings.publicPortfolio = true
    expect(portfolioFromState(s, deriveUserData(s, catalog), catalog).courses).toEqual([])
    s.works = [work({ courseId: 'mkt' })]
    expect(portfolioFromState(s, deriveUserData(s, catalog), catalog).courses.map((c) => [c.id, c.complete])).toEqual([['mkt', false]])
    s.completed = { a1: '2026-10-21' }
    const done = portfolioFromState(s, deriveUserData(s, catalog), catalog).courses[0]
    expect(done.complete).toBe(true)
    expect(done.completedAt).toBe('2026-10-21')
  })
})
