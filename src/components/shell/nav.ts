import type { IconName } from '@/components/ui/Icon'

export type NavItem = { to: string; label: string; icon: IconName }

/** Menu lateral, na ordem do protótipo (Aprenda → Pratique → Demonstre). */
export const NAV_GROUPS: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { to: '/inicio', label: 'Início', icon: 'House' },
      { to: '/objetivos', label: 'Objetivos', icon: 'Target' },
    ],
  },
  {
    group: 'Aprenda',
    items: [
      { to: '/cursos', label: 'Explorar cursos', icon: 'Compass' },
      { to: '/progresso', label: 'Meu progresso', icon: 'ChartColumn' },
    ],
  },
  {
    group: 'Pratique',
    items: [
      { to: '/projetos', label: 'Projetos', icon: 'FolderKanban' },
      { to: '/competencias', label: 'Competências', icon: 'Puzzle' },
    ],
  },
  {
    group: 'Demonstre',
    items: [
      { to: '/curriculo', label: 'Currículo', icon: 'FileText' },
      { to: '/certificados', label: 'Certificados', icon: 'Award' },
      { to: '/perfil', label: 'Perfil', icon: 'User' },
    ],
  },
]

/** Atalhos da barra inferior no celular. */
export const MOBILE_NAV: NavItem[] = [
  { to: '/inicio', label: 'Início', icon: 'House' },
  { to: '/cursos', label: 'Cursos', icon: 'Compass' },
  { to: '/projetos', label: 'Projetos', icon: 'FolderKanban' },
  { to: '/curriculo', label: 'Currículo', icon: 'FileText' },
]

/** O item está ativo na rota atual? (as aulas contam como "Explorar cursos"). */
export function isActive(path: string, to: string) {
  return path === to || path.startsWith(to + '/') || (to === '/cursos' && path.startsWith('/aula'))
}
