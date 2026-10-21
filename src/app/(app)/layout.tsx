import { Suspense } from 'react'
import { Mark } from '@/components/brand/Logo'
import { AppStateProvider } from '@/components/providers/AppState'
import { Toasts } from '@/components/ui/Toasts'
import { getCatalog } from '@/lib/data/catalog'
import { getCurrentUserState } from '@/lib/data/user'

/**
 * Área do aluno (tudo o que fica "depois do login").
 *
 * A leitura da sessão acontece dentro do <Suspense>: a casca da página carrega
 * na hora e os dados do aluno chegam logo em seguida. Se não houver sessão
 * válida, getCurrentUserState() manda para /entrar ANTES de qualquer dado sair
 * do servidor.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AppLoading />}>
      <SignedInApp>{children}</SignedInApp>
    </Suspense>
  )
}

async function SignedInApp({ children }: { children: React.ReactNode }) {
  const [catalog, state] = await Promise.all([getCatalog(), getCurrentUserState()])
  return (
    <AppStateProvider catalog={catalog} initialState={state}>
      {children}
      <Toasts />
    </AppStateProvider>
  )
}

function AppLoading() {
  return (
    <div className="boot" role="status" aria-label="Carregando">
      <Mark size={44} />
    </div>
  )
}
