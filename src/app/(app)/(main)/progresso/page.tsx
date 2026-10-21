import type { Metadata } from 'next'
import { ProgressView } from './ProgressView'

export const metadata: Metadata = { title: 'Meu progresso' }

export default function ProgressoPage() {
  return <ProgressView />
}
