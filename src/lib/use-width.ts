'use client'

import { useLayoutEffect, useState } from 'react'

/** Largura (px) de um elemento, atualizada quando ele muda de tamanho. 0 até o elemento existir. */
export function useWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [element])
  return width
}
