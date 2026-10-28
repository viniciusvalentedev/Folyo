import type { Metadata } from 'next'
import { Landing } from '@/components/landing/Landing'
import { INSTAGRAM_URL } from '@/components/landing/data'
import { getPublicConfig } from '@/lib/data/config'
import { publicRobots, SITE_NAME, SITE_URL } from '@/lib/seo'

const TITLE = 'Folyo · Aprenda. Crie. Conquiste.'
const DESCRIPTION =
  'Cursos práticos para desenvolver habilidades, criar um projeto real em cada curso e conquistar certificados que vão para o seu currículo. Comece pelo curso gratuito Descomplicando Processos Seletivos.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  robots: publicRobots(),
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'pt_BR', title: TITLE, description: DESCRIPTION, url: '/' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

/** Dados estruturados (JSON-LD): dizem ao Google quem é a Folyo e qual é o site oficial. */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      sameAs: [INSTAGRAM_URL],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description: DESCRIPTION,
      inLanguage: 'pt-BR',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
}

/**
 * Página pública da Folyo (landing): o que aparece em "/" para quem não está logado.
 * Quem já está logado nem chega aqui: o proxy manda direto para o início.
 */
export default async function Home() {
  const config = await getPublicConfig()
  return (
    <>
      <script
        type="application/ld+json"
        // "<" vira < para o texto nunca conseguir fechar a tag <script>.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
      />
      <Landing tagline={config.tagline} />
    </>
  )
}
