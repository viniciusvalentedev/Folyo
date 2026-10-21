import type { Metadata } from 'next'
import { ExploreView } from './ExploreView'

export const metadata: Metadata = { title: 'Explorar cursos' }

export default function CursosPage() {
  return <ExploreView />
}
