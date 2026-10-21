import { AppFrame } from '@/components/shell/AppFrame'

/** Sala de aula: menu lateral compacto para dar espaço ao vídeo. */
export default function ClassroomLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame classroom>{children}</AppFrame>
}
