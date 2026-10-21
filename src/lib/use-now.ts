'use client'

import { io } from 'next/cache'
import { use } from 'react'

/**
 * Data e hora atuais para usar DURANTE a renderização (ex.: "Boa noite").
 *
 * Com o Cache Components do Next 16, a parte estática da página é gerada no
 * build. `io()` avisa ao Next que este valor muda a cada visita, então ele fica
 * fora da parte estática. Quem usa este hook precisa estar dentro de <Suspense>.
 */
export function useNow() {
  use(io())
  return new Date()
}
