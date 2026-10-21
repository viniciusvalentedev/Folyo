import type { Metadata } from 'next'
import { CertificatesView } from './CertificatesView'

export const metadata: Metadata = { title: 'Certificados' }

export default function CertificadosPage() {
  return <CertificatesView />
}
