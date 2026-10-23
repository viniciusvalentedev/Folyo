'use client'

import { useSyncExternalStore } from 'react'
import { todayISO } from '@/lib/format'

const subscribe = () => () => {}
const clientToday = () => todayISO()
const serverToday = () => null

/**
 * Data de hoje (AAAA-MM-DD) no fuso do aluno, para gráficos que dependem do dia.
 * Vale `null` na pré-renderização do servidor e volta com a data certa assim que a
 * página abre no navegador (assim servidor e navegador nunca discordam).
 */
export function useToday(): string | null {
  return useSyncExternalStore(subscribe, clientToday, serverToday)
}
