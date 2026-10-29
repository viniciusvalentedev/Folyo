'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { PortfolioView } from '@/components/portfolio/PortfolioView'
import { useApp } from '@/components/providers/AppState'
import { Icon } from '@/components/ui/Icon'
import { DemoTag } from '@/components/ui/indicators'
import { useBack } from '@/components/ui/PageHead'
import { portfolioFromState, publicProfilePath } from '@/lib/public-profile'

/**
 * Pré-visualização do portfólio: mostra a página pública do jeito que ela aparece para quem visita,
 * com os dados do próprio aluno (mesmo desenho de /u/<endereço>).
 */
export function PublicView() {
  const { s, d, catalog } = useApp()
  const back = useBack()
  const data = useMemo(() => portfolioFromState(s, d, catalog), [s, d, catalog])
  const hasPublicWorks = s.works.some((w) => w.public)
  const slug = s.publicSlug

  const bar = (
    <div className="public-bar">
      <button type="button" className="backlink" onClick={() => back('/projetos')}>
        <Icon name="ArrowLeft" size={16} />
        Sair da pré-visualização
      </button>
      <DemoTag>Pré-visualização do portfólio</DemoTag>
    </div>
  )

  const alerts = (
    <>
      {!s.settings.publicProfile && (
        <div className="alert alert-warn public-alert">
          <Icon name="Lock" size={18} />
          <div>
            Seu perfil está <b>privado</b>: só você vê esta página, e o endereço público ainda não abre para ninguém. Mude em{' '}
            <Link href="/configuracoes">Configurações › Privacidade</Link>.
          </div>
        </div>
      )}
      {s.settings.publicProfile && !slug && (
        <div className="alert alert-warn public-alert">
          <Icon name="Link" size={18} />
          <div>
            Seu perfil está público, mas você ainda não escolheu um <b>endereço</b>. Escolha um em{' '}
            <Link href="/configuracoes">Configurações › Privacidade</Link> para poder compartilhar.
          </div>
        </div>
      )}
      {s.settings.publicProfile && slug && (
        <div className="alert alert-info public-alert">
          <Icon name="Globe" size={18} />
          <div>
            Seu perfil está no ar em{' '}
            <a href={publicProfilePath(slug)} target="_blank" rel="noopener noreferrer">
              <b>usefolyo.com{publicProfilePath(slug)}</b>
            </a>
            .
          </div>
        </div>
      )}
      {!s.settings.publicPortfolio && hasPublicWorks && (
        <div className="alert alert-warn public-alert">
          <Icon name="EyeOff" size={18} />
          <div>
            Seus projetos estão <b>ocultos</b> do portfólio público. Ligue &quot;Mostrar projetos no portfólio público&quot; em{' '}
            <Link href="/configuracoes">Configurações › Privacidade</Link>.
          </div>
        </div>
      )}
    </>
  )

  return <PortfolioView data={data} bar={bar} alerts={alerts} />
}
