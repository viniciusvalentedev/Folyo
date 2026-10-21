import { AppFrame } from '@/components/shell/AppFrame'
import { RequireOnboarded } from '@/components/shell/OnboardingGate'

/** Sala de aula: menu lateral compacto para dar espaço ao vídeo. */
export default function ClassroomLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RequireOnboarded />
      <AppFrame classroom>{children}</AppFrame>
    </>
  )
}
