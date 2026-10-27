import type { Metadata } from 'next'
import { Landing } from '@/components/landing/Landing'
import { getPublicConfig } from '@/lib/data/config'

const TITLE = 'Folyo · Aprenda. Crie. Conquiste.'
const DESCRIPTION =
  'Cursos práticos para desenvolver habilidades, criar um projeto real em cada curso e conquistar certificados que vão para o seu currículo. Comece pelo curso gratuito Descomplicando Processos Seletivos.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'Folyo', locale: 'pt_BR', title: TITLE, description: DESCRIPTION },
}

/**
 * Página pública da Folyo (landing): o que aparece em "/" para quem não está logado.
 * Quem já está logado nem chega aqui: o proxy manda direto para o início.
 */
export default async function Home() {
  const config = await getPublicConfig()
  return <Landing tagline={config.tagline} />
}
