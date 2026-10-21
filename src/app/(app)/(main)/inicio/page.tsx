import type { Metadata } from 'next'
import { DashboardView } from './DashboardView'

export const metadata: Metadata = { title: 'Início' }

export default function InicioPage() {
  return <DashboardView />
}
