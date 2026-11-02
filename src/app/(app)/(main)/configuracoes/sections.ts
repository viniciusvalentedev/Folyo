import type { IconName } from '@/components/ui/Icon'

export type Section = 'dados' | 'compras' | 'privacidade' | 'notificacoes' | 'aprendizagem' | 'preferencias' | 'conta'

/** Seções de Configurações, na ordem do menu. "Minhas compras" fica logo abaixo de "Dados pessoais". */
export const SECTIONS: { id: Section; label: string; icon: IconName }[] = [
  { id: 'dados', label: 'Dados pessoais', icon: 'User' },
  { id: 'compras', label: 'Minhas compras', icon: 'ShoppingBag' },
  { id: 'privacidade', label: 'Privacidade', icon: 'Shield' },
  { id: 'notificacoes', label: 'Notificações', icon: 'Bell' },
  { id: 'aprendizagem', label: 'Aprendizagem', icon: 'BookOpen' },
  { id: 'preferencias', label: 'Preferências', icon: 'SlidersHorizontal' },
  { id: 'conta', label: 'Conta', icon: 'LogOut' },
]

/** Lê `?secao=` da URL. Qualquer valor que não seja uma seção conhecida abre "Dados pessoais". */
export function parseSection(value: unknown): Section {
  const raw = Array.isArray(value) ? value[0] : value
  return SECTIONS.find((x) => x.id === raw)?.id ?? 'dados'
}
