'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { HREF } from './data'
import { LpIcon } from './icons'

/** Movimento reduzido: preferência do sistema ou modo "calmo" da Folyo (classe `calm` no <html>). */
const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm'))

/** Rola suavemente até a seção (sem animação para quem prefere movimento reduzido). */
const scrollToId = (id: string) =>
  document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })

/**
 * Moldura da landing: atalho "Pular para o conteúdo" e o efeito de revelar ao rolar.
 * Elementos `.lp-reveal` que começam abaixo da dobra ficam escondidos (`is-armed`)
 * e aparecem (`is-in`) quando entram na tela.
 */
export function LandingRoot({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    const items = [...root.querySelectorAll<HTMLElement>('.lp-reveal')].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.9,
    )
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            observer.unobserve(entry.target)
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )
    items.forEach((el) => {
      el.classList.add('is-armed')
      observer.observe(el)
    })
    const fallback = setTimeout(
      () =>
        items.forEach((el) => {
          if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in')
        }),
      2500,
    )
    return () => {
      observer.disconnect()
      clearTimeout(fallback)
    }
  }, [])

  return (
    <div className="lp" ref={ref}>
      <a
        href="#lp-main"
        className="skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('lp-main')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      {children}
    </div>
  )
}

/** Cabeçalho fixo: fica com fundo desfocado depois de rolar um pouco. */
export function LandingHeader() {
  const [solid, setSolid] = useState(false)

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    scrollToId(id)
  }

  return (
    <header className={'lp-head' + (solid ? ' solid' : '')}>
      <div className="lp-head-in">
        <Link
          href="/"
          className="lp-logo"
          aria-label="Folyo, início"
          onClick={(e) => {
            e.preventDefault()
            window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
          }}
        >
          <Wordmark height={30} tone="violet" />
        </Link>
        <nav className="lp-anchors" aria-label="Seções da página">
          <a href="#o-que-e" onClick={go('o-que-e')}>
            O que é
          </a>
          <a href="#curso-gratis" onClick={go('curso-gratis')}>
            Curso grátis
          </a>
          <a href="#por-que" onClick={go('por-que')}>
            Por que a Folyo?
          </a>
          <a href="#duvidas" onClick={go('duvidas')}>
            Dúvidas
          </a>
        </nav>
        <nav className="lp-auth" aria-label="Acesso">
          <Link href={HREF.entrar} className="btn btn-sm btn-ghost-on-dark lp-btn">
            Entrar
          </Link>
          <Link href={HREF.criarConta} className="btn btn-sm btn-primary lp-btn lp-btn-glow">
            <span>
              Criar conta<span className="lp-wide"> grátis</span>
            </span>
          </Link>
        </nav>
      </div>
    </header>
  )
}

/** Botão "O que é a Folyo?" do hero: rola até a seção. */
export function WhatIsButton() {
  return (
    <button type="button" className="btn btn-lg btn-quiet-dark lp-btn" onClick={() => scrollToId('o-que-e')}>
      O que é a Folyo?
      <LpIcon name="ArrowDown" size={17} />
    </button>
  )
}

/** Atalho fixo no celular: aparece depois do hero e some quando a chamada final entra na tela. */
export function LandingSticky() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const update = () => {
      const hero = document.querySelector('.lp-hero')
      const final = document.querySelector('.lp-final')
      const pastHero = hero ? hero.getBoundingClientRect().bottom < 0 : window.scrollY > 700
      const atFinal = final ? final.getBoundingClientRect().top < window.innerHeight : false
      setOn(pastHero && !atFinal)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className={'lp-sticky' + (on ? ' on' : '')} aria-hidden={!on}>
      <Link href={HREF.cursoGratis} className="btn btn-go lp-btn" tabIndex={on ? 0 : -1}>
        <LpIcon name="Sparkles" size={16} />
        Curso grátis
      </Link>
      <Link href={HREF.criarConta} className="btn btn-primary lp-btn" tabIndex={on ? 0 : -1}>
        Criar conta grátis
      </Link>
    </div>
  )
}

const noSubscribe = () => () => {}
const clientYear = () => new Date().getFullYear()
const serverYear = () => null

/**
 * Ano atual do rodapé. Vale `null` na pré-renderização do servidor (a página continua
 * estática) e aparece assim que a página abre no navegador, como em `useToday`.
 */
export function FooterYear() {
  const year = useSyncExternalStore(noSubscribe, clientYear, serverYear)
  return <>{year ?? ''}</>
}
