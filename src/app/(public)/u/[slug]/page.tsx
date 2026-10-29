import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { Mark, Wordmark } from '@/components/brand/Logo'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { ButtonLink } from '@/components/ui/Button'
import { getPublicProfile } from '@/lib/data/public-profile'

/**
 * Perfil público: o portfólio que qualquer pessoa abre pelo link /u/<endereço>, com ou sem login.
 *
 * - Só aparece se a pessoa ligou "Perfil público" e escolheu o endereço (quem decide é o banco).
 *   Perfil privado e endereço inexistente têm a mesma resposta: ninguém descobre quem tem conta.
 *   A tela de "não encontrado" é montada aqui, no servidor (e não com notFound()): a página abre em
 *   streaming, então o status HTTP já saiu como 200 e um notFound() só viraria tela no navegador,
 *   deixando quem está sem JavaScript preso no carregamento.
 * - Não é indexada pelo Google (noindex aqui e no cabeçalho X-Robots-Tag, em next.config.ts).
 * - O título da aba é fixo de propósito: ler o nome da pessoa no <head> exigiria consultar o banco
 *   antes de mostrar qualquer coisa; o nome aparece na própria página.
 */
export const metadata: Metadata = {
  title: 'Portfólio',
  description: 'Portfólio construído na Folyo.',
  robots: { index: false, follow: false },
}

export default function PublicProfilePage({ params }: PageProps<'/u/[slug]'>) {
  return (
    <Suspense fallback={<Loading />}>
      <Profile params={params} />
    </Suspense>
  )
}

function Loading() {
  return (
    <div className="public-state" role="status" aria-label="Carregando">
      <Mark size={44} />
    </div>
  )
}

async function Profile({ params }: { params: PageProps<'/u/[slug]'>['params'] }) {
  const { slug } = await params
  const result = await getPublicProfile(slug)
  if (!result.ok && result.reason === 'notfound') {
    // Endereço que não existe OU perfil privado/suspenso: a mesma tela, de propósito.
    return (
      <div className="public-state">
        <Mark size={44} />
        <h1>Perfil não encontrado</h1>
        <p>Este endereço não existe ou a pessoa deixou o perfil privado.</p>
        <ButtonLink href="/" variant="quiet">
          Conhecer a Folyo
        </ButtonLink>
      </div>
    )
  }
  if (!result.ok) {
    return (
      <div className="public-state">
        <Mark size={44} />
        <h1>Não foi possível abrir este perfil agora</h1>
        <p>Tente de novo em alguns instantes.</p>
        <ButtonLink href="/" variant="quiet">
          Ir para a Folyo
        </ButtonLink>
      </div>
    )
  }

  const bar = (
    <div className="public-bar">
      <Link href="/" className="public-bar-brand" aria-label="Folyo: página inicial">
        <Wordmark height={26} />
      </Link>
      <ButtonLink href="/" size="sm" variant="ghost-on-dark" className="public-bar-cta">
        Conhecer a Folyo
      </ButtonLink>
    </div>
  )

  return <PortfolioView data={result.data} slug={slug.toLowerCase()} bar={bar} />
}
