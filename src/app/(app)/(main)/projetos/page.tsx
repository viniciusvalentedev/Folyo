import type { Metadata } from 'next'
import { ProjectsView } from './ProjectsView'

export const metadata: Metadata = { title: 'Projetos' }

export default function ProjetosPage() {
  return <ProjectsView />
}
