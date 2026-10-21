import type { Metadata } from 'next'
import { ProfileView } from './ProfileView'

export const metadata: Metadata = { title: 'Perfil' }

export default function PerfilPage() {
  return <ProfileView />
}
