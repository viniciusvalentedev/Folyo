import { AppFrame } from '@/components/shell/AppFrame'

/** Páginas com a moldura completa (menu lateral + barra do topo). */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>
}
