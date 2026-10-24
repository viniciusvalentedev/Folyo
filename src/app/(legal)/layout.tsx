import Link from 'next/link'
import { Wordmark } from '@/components/brand/Logo'

/** Moldura das páginas legais (Privacidade e Termos): abertas a qualquer pessoa, com ou sem login. */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal surface-paper">
      <a href="#conteudo" className="skip">
        Pular para o conteúdo
      </a>
      <header className="legal-bar">
        <Link href="/entrar" aria-label="Folyo: ir para a entrada">
          <Wordmark height={32} tone="indigo" text="var(--ink)" />
        </Link>
        <nav aria-label="Páginas legais">
          <Link href="/termos">Termos de uso</Link>
          <Link href="/privacidade">Privacidade</Link>
        </nav>
      </header>
      <main id="conteudo" tabIndex={-1} className="legal-doc">
        {children}
      </main>
      <footer className="legal-foot">
        <Link href="/entrar">Voltar para a Folyo</Link>
      </footer>
    </div>
  )
}
