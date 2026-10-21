import type { Metadata } from 'next'
import { GoalsView } from './GoalsView'

export const metadata: Metadata = { title: 'Objetivos' }

export default function ObjetivosPage() {
  return <GoalsView />
}
