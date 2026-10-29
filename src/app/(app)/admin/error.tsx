'use client'

import { Button, ButtonLink } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'

/**
 * Se uma tela do painel quebrar, mostramos esta mensagem no lugar dela (antes, a tela ficava em
 * branco). Por segurança, os detalhes técnicos não aparecem: eles ficam nos logs do servidor
 * (Vercel → Logs), com o código "digest" abaixo para achar o registro.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="ad-page">
      <EmptyState
        icon="CircleAlert"
        title="Esta tela do painel não carregou"
        action={
          <>
            <Button onClick={() => retry()}>Tentar de novo</Button>
            <ButtonLink href="/inicio" variant="ghost">
              Voltar para a Folyo
            </ButtonLink>
          </>
        }
      >
        Tente de novo em instantes.{error.digest ? ` Código para o suporte: ${error.digest}.` : ''}
      </EmptyState>
    </div>
  )
}
