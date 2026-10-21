import { AppStateProvider } from '@/components/providers/AppState'
import { Toasts } from '@/components/ui/Toasts'
import { getCatalog } from '@/lib/data/catalog'
import { getCurrentUserState } from '@/lib/data/user'

/**
 * Área do aluno (tudo o que fica "depois do login").
 *
 * Próxima etapa (login real): a leitura do usuário passa a depender do cookie de
 * sessão, então ela vai para dentro de um <Suspense> e quem não estiver logado é
 * redirecionado para /entrar — tudo isso no servidor, antes de qualquer dado sair.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [catalog, state] = await Promise.all([getCatalog(), getCurrentUserState()])
  return (
    <AppStateProvider catalog={catalog} initialState={state}>
      {children}
      <Toasts />
    </AppStateProvider>
  )
}
