import type { Metadata } from 'next'
import { SkillsView } from './SkillsView'

export const metadata: Metadata = { title: 'Competências' }

export default function CompetenciasPage() {
  return <SkillsView />
}
