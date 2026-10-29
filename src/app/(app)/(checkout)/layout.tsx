import { Suspense } from 'react'
import { RequireOnboarded } from '@/components/shell/OnboardingGate'
import { RouteFocus } from '@/lib/a11y'

/**
 * Telas de compra (/comprar, /carrinho, /finalizar): sem menu lateral, com um topo simples.
 * O login é exigido pelo proxy e de novo pelo layout da área do aluno (quem não entrou vai para
 * /entrar e volta para cá depois). Nenhuma delas cobra nada: não existe pagamento na Folyo.
 */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RequireOnboarded />
      <a
        href="#main"
        className="skip"
      >
        Pular para o conteúdo
      </a>
      {children}
      <Suspense fallback={null}>
        <RouteFocus target="main" />
      </Suspense>
    </>
  )
}
