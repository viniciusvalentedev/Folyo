import { redirect } from 'next/navigation'

/**
 * Por enquanto a página inicial leva para a tela de entrada.
 * No futuro, aqui pode morar a página pública de apresentação da Folyo (landing page).
 */
export default function Home() {
  redirect('/entrar')
}
