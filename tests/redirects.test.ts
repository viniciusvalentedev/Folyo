import { describe, expect, it } from 'vitest'
import { HOME_PATH, isGuestOnlyPath, isPublicPath, safeNext } from '@/lib/auth/redirects'

describe('safeNext (open redirect)', () => {
  it('aceita destinos internos', () => {
    expect(safeNext('/cursos/mkt')).toBe('/cursos/mkt')
    expect(safeNext('/aula/mkt/mkt-3?x=1')).toBe('/aula/mkt/mkt-3?x=1')
  })

  it.each([
    'https://site-falso.com',
    'http://site-falso.com/x',
    '//site-falso.com',
    '/\\site-falso.com',
    'javascript:alert(1)',
    'cursos',
    '',
    '/ok\nLocation: https://x.com',
    '/ok\u0000',
    '/' + 'a'.repeat(400),
  ])('bloqueia %j', (value) => {
    expect(safeNext(value)).toBe(HOME_PATH)
  })

  it('não aceita valores que não são texto', () => {
    expect(safeNext(null)).toBe(HOME_PATH)
    expect(safeNext(undefined)).toBe(HOME_PATH)
    expect(safeNext(123)).toBe(HOME_PATH)
    expect(safeNext({})).toBe(HOME_PATH)
  })

  it('não manda quem acabou de entrar de volta para /entrar', () => {
    expect(safeNext('/entrar')).toBe(HOME_PATH)
    expect(safeNext('/entrar?next=/x')).toBe(HOME_PATH)
    expect(safeNext('/esqueci-senha')).toBe(HOME_PATH)
  })

  it('usa o fallback informado', () => {
    expect(safeNext('https://x.com', '/perfil')).toBe('/perfil')
  })
})

describe('páginas públicas', () => {
  it('páginas de login e textos legais são públicos', () => {
    for (const p of ['/', '/entrar', '/esqueci-senha', '/auth/confirmar', '/privacidade', '/termos']) {
      expect(isPublicPath(p)).toBe(true)
    }
  })

  it('área do aluno e painel exigem login', () => {
    for (const p of ['/inicio', '/cursos', '/admin', '/admin/usuarios', '/api/trabalhos/x/arquivo', '/redefinir-senha']) {
      expect(isPublicPath(p)).toBe(false)
    }
  })

  it('não confunde prefixos parecidos', () => {
    expect(isPublicPath('/entrarx')).toBe(false)
    expect(isPublicPath('/termos-secretos')).toBe(false)
  })

  it('só /entrar e /esqueci-senha são só para visitantes', () => {
    expect(isGuestOnlyPath('/entrar')).toBe(true)
    expect(isGuestOnlyPath('/esqueci-senha')).toBe(true)
    expect(isGuestOnlyPath('/privacidade')).toBe(false)
    expect(isGuestOnlyPath('/inicio')).toBe(false)
  })
})
