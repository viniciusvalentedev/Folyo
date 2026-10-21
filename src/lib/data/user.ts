import 'server-only'
import { demoUserState } from '@/lib/mock/demo-user'
import type { UserState } from '@/lib/types'

/**
 * Camada de acesso a dados do USUÁRIO logado.
 *
 * Hoje devolve a conta de demonstração. Quando o login existir, esta função vai:
 *  1. ler a sessão (cookie) do Supabase Auth;
 *  2. redirecionar para /entrar se não houver sessão válida;
 *  3. buscar no banco SÓ os dados do próprio usuário (com RLS ativado nas tabelas).
 *
 * Regra de ouro: quem decide o que o usuário pode ver é o servidor/banco,
 * nunca o navegador.
 */
export async function getCurrentUserState(): Promise<UserState> {
  return structuredClone(demoUserState)
}

/**
 * Ids dos projetos da conta de demonstração, para gerar as páginas no build.
 * Com o banco, as páginas de projeto passam a ser geradas na hora, por usuário.
 */
export async function getDemoProjectParams() {
  return demoUserState.projects.map((p) => ({ id: p.id }))
}
