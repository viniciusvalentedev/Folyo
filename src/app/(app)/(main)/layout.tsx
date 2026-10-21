import { AppFrame } from '@/components/shell/AppFrame'
import { RequireOnboarded } from '@/components/shell/OnboardingGate'

/** Páginas com a moldura completa (menu lateral + barra do topo). */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RequireOnboarded />
      <AppFrame>{children}</AppFrame>
    </>
  )
}
