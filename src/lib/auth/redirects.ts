/**
 * Regras de redirecionamento ligadas ao login.
 * (Arquivo sem dependências: usado pelo proxy, pelas ações e pelas páginas.)
 */

/** Páginas que qualquer pessoa pode abrir sem login. */
const PUBLIC_PATHS = ['/entrar', '/esqueci-senha', '/auth/confirmar', '/privacidade', '/termos']

/** Páginas que não fazem sentido para quem já está logado. */
const GUEST_ONLY_PATHS = ['/entrar', '/esqueci-senha']

const matches = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p + '/'))

export const isPublicPath = (path: string) => path === '/' || matches(path, PUBLIC_PATHS)
export const isGuestOnlyPath = (path: string) => matches(path, GUEST_ONLY_PATHS)

/** Para onde vai quem acabou de entrar, se não houver outro destino. */
export const HOME_PATH = '/inicio'

/**
 * Aceita só destinos internos (ex.: "/cursos/mkt").
 * Bloqueia "https://site-falso.com", "//site-falso.com" e "/\\site-falso.com",
 * que levariam o aluno para fora da Folyo depois do login (open redirect).
 */
export function safeNext(value: unknown, fallback = HOME_PATH): string {
  if (typeof value !== 'string' || value.length > 300) return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  if (isGuestOnlyPath(value.split('?')[0])) return fallback
  return value
}
