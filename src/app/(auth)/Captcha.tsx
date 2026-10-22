'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * CAPTCHA da Cloudflare (Turnstile).
 *
 * Mostra uma caixinha que confere, quase sempre sem pedir nada, que quem está
 * preenchendo é uma pessoa. Ela coloca no formulário um comprovante
 * ("cf-turnstile-response") que o servidor repassa ao Supabase, e é o SUPABASE
 * quem confere esse comprovante com a chave secreta (que fica só no painel dele).
 *
 * Cada comprovante vale uma vez só e por 5 minutos. Por isso, quando o formulário
 * volta com erro, pedimos um novo (resetSignal).
 *
 * Sem a variável NEXT_PUBLIC_TURNSTILE_SITE_KEY (ex.: no seu computador), não
 * mostra nada e o formulário funciona normal.
 */

type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string
  reset(id: string): void
  remove(id: string): void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
export const captchaEnabled = SITE_KEY !== ''

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      // Deixa tentar de novo da próxima vez (ex.: a internet voltou).
      loading = null
      script.remove()
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function Captcha({
  action,
  resetSignal,
  onReady,
}: {
  /** Nome da tela (só letras, números, - e _), aparece no painel da Cloudflare. */
  action: string
  /** Quando muda, pede um comprovante novo (o anterior já foi gasto). */
  resetSignal?: unknown
  /** Avisa se já existe um comprovante válido (para liberar o botão). */
  onReady: (ready: boolean) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const [failed, setFailed] = useState(false)
  const ready = useRef(onReady)
  useEffect(() => {
    ready.current = onReady
  })

  useEffect(() => {
    if (!captchaEnabled) return
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !box.current) return
        widget.current = turnstile.render(box.current, {
          sitekey: SITE_KEY,
          action,
          theme: 'auto',
          language: 'pt-br',
          size: 'flexible',
          'response-field-name': 'cf-turnstile-response',
          callback: () => {
            setFailed(false)
            ready.current(true)
          },
          'expired-callback': () => ready.current(false),
          'timeout-callback': () => ready.current(false),
          'error-callback': () => {
            setFailed(true)
            ready.current(false)
          },
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
      ready.current(false)
    }
  }, [action])

  // O formulário voltou (com erro): o comprovante já foi usado, pede outro.
  const firstSignal = useRef(true)
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false
      return
    }
    if (widget.current && window.turnstile) {
      ready.current(false)
      window.turnstile.reset(widget.current)
    }
  }, [resetSignal])

  if (!captchaEnabled) return null
  return (
    <div className="captcha">
      <div ref={box} />
      {failed && (
        <p className="muted small" role="alert">
          Não conseguimos carregar a verificação anti-robô. Confira sua internet (ou desative bloqueadores de anúncio
          nesta página) e recarregue.
        </p>
      )}
    </div>
  )
}
