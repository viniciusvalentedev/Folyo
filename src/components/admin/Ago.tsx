'use client'

import { useNow } from '@/lib/use-now'
import { fmtAgo, fmtDateTime } from './ui'

/** "Há 3 dias" (calculado no navegador, com a data completa ao passar o mouse). */
export function Ago({ value }: { value: string | null | undefined }) {
  const now = useNow()
  return <span title={value ? fmtDateTime(value) : undefined}>{fmtAgo(value, now.getTime())}</span>
}
