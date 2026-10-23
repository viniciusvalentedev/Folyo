import { getPublicConfig } from '@/lib/data/config'
import { AuthTaglineProvider } from './AuthShell'

/** Telas de entrada: leva a frase configurada no painel (em cache, sem dados de ninguém) até o AuthShell. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const config = await getPublicConfig()
  return <AuthTaglineProvider value={config.tagline}>{children}</AuthTaglineProvider>
}
