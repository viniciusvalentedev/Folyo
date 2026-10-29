'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShop } from '@/components/providers/Shop'
import { Icon } from '@/components/ui/Icon'
import { PROMO } from '@/lib/cart'
import { useFocusTrap } from '@/lib/a11y'

/**
 * Aviso de lançamento (cupom FOLYO100).
 *
 * Aparece uma vez por conta: logado, promoção ligada no banco, com algum curso que participa,
 * sem pré-acesso valendo e sem ter fechado o aviso antes. Fica aberto até a pessoa fechar
 * (X, Esc, fundo, "Agora não" ou "Conhecer os cursos"); qualquer jeito de fechar marca como visto.
 * Não aparece na sala de aula nem nas configurações (login, primeiro acesso e compra nem usam
 * esta moldura).
 */

const SEEN_KEY = 'folyo-aviso-lancamento-v1'
const HIDDEN_ON = ['/aula', '/configuracoes']
const DELAY_MS = 700

/** Se o navegador não deixa gravar (aba privada), pelo menos não repete nesta aba. */
const seenThisTab = new Set<string>()

function wasSeen(userId: string) {
  if (seenThisTab.has(userId)) return true
  try {
    return window.localStorage.getItem(`${SEEN_KEY}:${userId}`) === '1'
  } catch {
    return false
  }
}

function markSeen(userId: string) {
  seenThisTab.add(userId)
  try {
    window.localStorage.setItem(`${SEEN_KEY}:${userId}`, '1')
  } catch {
    // Sem armazenamento: vale só para esta aba.
  }
}

export function PromoLaunchModal() {
  const { shop, promoCourses, hasPreAccess } = useShop()
  const path = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const blocked = HIDDEN_ON.some((p) => path === p || path?.startsWith(p + '/'))
  const eligible = promoCourses.length > 0 && !hasPreAccess

  useEffect(() => {
    if (!eligible || blocked || open || wasSeen(shop.userId)) return
    const t = setTimeout(() => setOpen(true), DELAY_MS)
    return () => clearTimeout(t)
  }, [eligible, blocked, open, shop.userId])

  // Foi para uma página onde o aviso não aparece: some sem contar como visto.
  const visible = open && eligible && !blocked

  const close = () => {
    markSeen(shop.userId)
    setOpen(false)
  }

  if (!visible) return null
  return createPortal(
    <LaunchDialog
      onClose={close}
      onExplore={() => {
        close()
        router.push('/cursos')
      }}
    />,
    document.body,
  )
}

function LaunchDialog({ onClose, onExplore }: { onClose: () => void; onExplore: () => void }) {
  const box = useFocusTrap<HTMLDivElement>(true, onClose)
  const code = useRef<HTMLElement>(null)
  const [copied, setCopied] = useState(false)

  // Fundo parado enquanto o aviso está aberto.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMO.code)
      setCopied(true)
    } catch {
      // Sem acesso à área de transferência: seleciona o código para a pessoa copiar.
      const el = code.current
      const sel = window.getSelection()
      if (el && sel) {
        const range = document.createRange()
        range.selectNodeContents(el)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  return (
    <div className="launch-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="launch-modal surface-ink" role="dialog" aria-modal="true" aria-labelledby="launch-h" aria-describedby="launch-d" ref={box}>
        <span className="launch-glyph" aria-hidden="true" />
        <button type="button" className="launch-x" aria-label="Fechar aviso de lançamento" onClick={onClose}>
          <Icon name="X" size={18} />
        </button>
        <p className="launch-badge">
          <i aria-hidden="true" />
          Lançamento
        </p>
        <h2 id="launch-h" className="launch-h">
          A Folyo está chegando, e você pode <span className="txt-lime">chegar primeiro.</span>
        </h2>
        <p id="launch-d" className="launch-d">
          Estamos liberando um mês de pré-acesso promocional aos cursos elegíveis. Explore novas habilidades, desenvolva projetos e comece a construir um portfólio
          que mostre o que você sabe fazer.
        </p>
        <div className="launch-ticket">
          <div>
            <small>Seu cupom</small>
            <code ref={code}>{PROMO.code}</code>
          </div>
          <button type="button" className="launch-copy" onClick={copy} aria-live="polite">
            <Icon name={copied ? 'Check' : 'Copy'} size={15} />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
        <p className="launch-tip">Insira o cupom no carrinho e confira sua oferta de lançamento.</p>
        <div className="launch-actions">
          <button type="button" className="btn btn-go btn-lg" onClick={onExplore}>
            <span>Conhecer os cursos</span>
            <Icon name="ArrowRight" size={17} />
          </button>
          <button type="button" className="launch-later" onClick={onClose}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
