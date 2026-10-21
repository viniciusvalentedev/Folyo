'use client'

import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/indicators'

/**
 * Se alguma tela quebrar, mostramos esta mensagem amigável no lugar dela.
 * Por segurança, os detalhes técnicos do erro NÃO aparecem para o usuário.
 * (Quando tivermos monitoramento, o erro é enviado para lá.)
 */
export default function AppError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="page surface-paper">
      <EmptyState
        icon="CircleAlert"
        title="Algo saiu do lugar nesta tela"
        action={<Button onClick={() => retry()}>Tentar de novo</Button>}
      >
        Tente de novo. Se continuar, volte para o início.
      </EmptyState>
    </div>
  )
}
