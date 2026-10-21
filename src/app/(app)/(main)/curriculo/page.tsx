import type { Metadata } from 'next'
import { ResumeView } from './ResumeView'

export const metadata: Metadata = { title: 'Currículo' }

export default function CurriculoPage() {
  return <ResumeView />
}
