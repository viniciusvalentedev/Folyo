import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { getPublicConfig } from '@/lib/data/config'
import { SITE_NAME, SITE_URL } from '@/lib/seo'

import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/components.css'
import '@/styles/pages/inicio.css'
import '@/styles/pages/explorar.css'
import '@/styles/pages/curso.css'
import '@/styles/pages/aula.css'
import '@/styles/pages/projetos.css'
import '@/styles/pages/curriculo.css'
import '@/styles/pages/progresso.css'
import '@/styles/pages/perfil.css'
import '@/styles/pages/publico.css'
import '@/styles/pages/certificados.css'
import '@/styles/pages/objetivos.css'
import '@/styles/pages/configuracoes.css'
import '@/styles/pages/entrada.css'
import '@/styles/pages/landing.css'
import '@/styles/pages/primeiro-acesso.css'
import '@/styles/pages/admin.css'
import '@/styles/pages/legal.css'
import '@/styles/responsive.css'
import '@/styles/motion.css'

/*
 * Fontes servidas pelo próprio site (arquivos em src/app/fonts).
 * Assim o navegador do aluno não precisa falar com o Google Fonts:
 * mais rápido, mais privado e compatível com a política de segurança (CSP).
 */
const inter = localFont({
  src: './fonts/inter-latin-var.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

const poppins = localFont({
  src: [
    { path: './fonts/poppins-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/poppins-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/poppins-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-poppins',
  display: 'swap',
})

const mono = localFont({
  src: './fonts/jetbrains-mono-latin-var.woff2',
  weight: '100 800',
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

/** Nome e frase vêm das Configurações do painel (em cache; sem elas, valem os padrões da Folyo). */
export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig()
  return {
    // Base dos endereços de imagem de compartilhamento e dos links canônicos.
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title: { default: config.name, template: `%s · ${config.name}` },
    description: config.tagline,
    // Padrão do site: NÃO indexar. Só a landing, os Termos e a Privacidade ligam a indexação
    // (publicRobots em src/lib/seo.ts), e só na produção. Telas de login e área do aluno ficam fechadas.
    robots: { index: false, follow: false },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'pt_BR' },
    twitter: { card: 'summary_large_image' },
  }
}

export const viewport: Viewport = {
  themeColor: '#0B0B12',
  colorScheme: 'dark',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
