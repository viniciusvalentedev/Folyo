'use client'

import Link from 'next/link'
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { Wordmark } from '@/components/brand/Logo'
import { useFocusTrap } from '@/lib/a11y'
import { HREF, NAV_SECTIONS, UI_WEEK } from './data'
import { LpIcon } from './icons'

/** Movimento reduzido: preferência do sistema ou modo "calmo" da Folyo (classe `calm` no <html>). */
const reducedMotion = () =>
  typeof matchMedia !== 'undefined' &&
  (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('calm'))

/** Assinatura vazia para `useSyncExternalStore` (valores que só mudam entre servidor e navegador). */
const noSubscribe = () => () => {}

/** Rola suavemente até a seção (ou ao topo), sem animação para quem prefere movimento reduzido. */
function scrollToSection(id: string) {
  const behavior = reducedMotion() ? 'auto' : 'smooth'
  if (id === 'topo') window.scrollTo({ top: 0, behavior })
  else document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' })
}

/**
 * Moldura da landing: atalho "Pular para o conteúdo" e o efeito de revelar ao rolar.
 * Elementos `.lx-rv` que começam abaixo da dobra ficam escondidos (`is-armed`)
 * e aparecem (`is-in`) quando entram na tela.
 */
export function LandingRoot({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root || reducedMotion() || typeof IntersectionObserver === 'undefined') return
    const items = [...root.querySelectorAll<HTMLElement>('.lx-rv')].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92,
    )
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in')
            observer.unobserve(entry.target)
          }
        }),
      { rootMargin: '0px 0px -6% 0px', threshold: 0.1 },
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
    <div className={'lx ' + className} ref={ref}>
      <a
        href="#lx-main"
        className="skip"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('lx-main')?.focus()
        }}
      >
        Pular para o conteúdo
      </a>
      {children}
    </div>
  )
}

/** Link para uma seção da própria página: rola suave em vez de pular. */
export function SectionLink({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={'#' + to}
      className={className}
      onClick={(e: MouseEvent) => {
        e.preventDefault()
        scrollToSection(to)
      }}
    >
      {children}
    </a>
  )
}

/**
 * Cabeçalho fixo: ganha fundo desfocado depois de rolar, marca a seção em que a pessoa está
 * e, no celular, vira um menu que abre pelo botão (Esc fecha; o Tab fica dentro enquanto aberto).
 */
export function LandingHeader() {
  const [solid, setSolid] = useState(false)
  const [current, setCurrent] = useState('topo')
  const [open, setOpen] = useState(false)
  const ref = useFocusTrap<HTMLElement>(open, () => setOpen(false))

  useEffect(() => {
    const onScroll = () => {
      setSolid(window.scrollY > 10)
      let at = 'topo'
      for (const [id] of NAV_SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) at = id
      }
      setCurrent(at)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const go = (id: string) => (e: MouseEvent) => {
    e.preventDefault()
    setOpen(false)
    scrollToSection(id)
  }

  return (
    <header ref={ref} className={'lx-head' + (solid ? ' solid' : '') + (open ? ' open' : '')}>
      <div className="lx-wrap lx-head-in">
        <a href="#topo" className="lx-logo" aria-label="Folyo, voltar ao topo" onClick={go('topo')}>
          <Wordmark height={30} tone="violet" text="#0B0B12" />
        </a>
        <nav className="lx-nav" aria-label="Seções da página">
          {NAV_SECTIONS.map(([id, label]) => (
            <a key={id} href={'#' + id} onClick={go(id)} aria-current={current === id ? 'true' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="lx-auth">
          <Link href={HREF.entrar} className="lx-login">
            Entrar
          </Link>
          <Link href={HREF.criarConta} className="lx-btn lx-btn-blue lx-btn-sm">
            Criar conta grátis
          </Link>
          <button
            type="button"
            className="lx-burger"
            aria-expanded={open}
            aria-controls="lx-menu"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setOpen((o) => !o)}
          >
            <LpIcon name={open ? 'X' : 'Menu'} size={22} />
          </button>
        </div>
      </div>
      <div id="lx-menu" className="lx-menu" hidden={!open}>
        {NAV_SECTIONS.map(([id, label]) => (
          <a key={id} href={'#' + id} onClick={go(id)}>
            {label}
            <LpIcon name="ArrowRight" size={18} />
          </a>
        ))}
        <div className="lx-menu-cta">
          <Link href={HREF.criarConta} className="lx-btn lx-btn-blue">
            Começar gratuitamente
          </Link>
          <Link href={HREF.entrar} className="lx-btn lx-btn-line">
            Entrar
          </Link>
        </div>
      </div>
    </header>
  )
}

/** Selo que gira no canto do hero ("aprenda · crie · conquiste"): leva à faixa "Conhecer a Folyo". */
export function SpinBadge() {
  return (
    <button type="button" className="lx-spin" onClick={() => scrollToSection('conhecer')} aria-label="Conhecer a Folyo">
      <svg className="lx-spin-txt" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <path id="lx-circ" d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
        </defs>
        <text textLength="286" lengthAdjust="spacing">
          <textPath href="#lx-circ" textLength="286" lengthAdjust="spacing">
            aprenda · crie · conquiste ·{' '}
          </textPath>
        </text>
      </svg>
      <LpIcon name="ArrowDownRight" size={20} />
    </button>
  )
}

/* ---- Hora do navegador (a página é gerada no build: data e saudação só no navegador) ---- */

type Clock = { greeting: string; date: string; week: { n: string; d: number; today: boolean; future: boolean; on: boolean }[] }

let clockCache: { key: string; value: Clock } | null = null

/** Saudação, data por extenso e a semana atual (com dias "estudados" de exemplo), no fuso de quem vê. */
function readClock(): Clock {
  const now = new Date()
  const key = now.toDateString() + now.getHours()
  if (clockCache?.key === key) return clockCache.value
  const hour = now.getHours()
  const todayIdx = (now.getDay() + 6) % 7
  const value: Clock = {
    greeting: hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite',
    date: now
      .toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
      .replace('-feira', '')
      .toUpperCase(),
    week: UI_WEEK.map((n, i) => {
      const day = new Date(now)
      day.setDate(now.getDate() - todayIdx + i)
      return { n, d: day.getDate(), today: i === todayIdx, future: i > todayIdx, on: i < todayIdx && i % 3 !== 2 }
    }),
  }
  clockCache = { key, value }
  return value
}

const serverClock = () => null

/** Cabeçalho da miniatura do Início: data, "Boa noite, Ana." e a semana com as estrelas de estudo. */
export function UiDashTop() {
  const clock = useSyncExternalStore(noSubscribe, readClock, serverClock)
  return (
    <>
      <p className="ui-eyebrow">{clock?.date ?? ' '}</p>
      <p className="ui-h1">{clock ? clock.greeting : 'Olá'}, Ana.</p>
      <p className="ui-sub">
        Seu objetivo: <b>Aprender marketing digital.</b>
      </p>
      <ol className="ui-week">
        {(clock?.week ?? UI_WEEK.map((n) => ({ n, d: null, today: false, future: false, on: false }))).map((day) => (
          <li key={day.n} className={(day.today ? 'today ' : '') + (day.future ? 'future ' : '') + (day.on ? 'on' : '')}>
            <i>{day.on || day.today ? '★' : ''}</i>
            <small>{day.n}</small>
            <b>{day.d ?? ' '}</b>
          </li>
        ))}
      </ol>
    </>
  )
}

/* ---- Áreas do conhecimento ---- */

export type AreaItem = {
  id: string
  name: string
  icon: ReactNode
  count: string
  /** Cursos da área já renderizados no servidor (vazio = "Em breve"). */
  courses: ReactNode[]
}

/**
 * Cápsulas das áreas: as que têm cursos abrem um painel com a lista (uma por vez);
 * as outras aparecem como "Em breve".
 */
export function AreaCaps({ areas }: { areas: AreaItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = areas.find((a) => a.id === openId && a.courses.length)
  return (
    <>
      <ul className="lx-caps lx-rv">
        {areas.map((area, i) => (
          <li key={area.id} style={{ '--i': i } as CSSProperties}>
            {area.courses.length ? (
              <button
                type="button"
                className={'lx-cap on' + (openId === area.id ? ' sel' : '')}
                aria-expanded={openId === area.id}
                aria-controls="lx-area-panel"
                onClick={() => setOpenId(openId === area.id ? null : area.id)}
              >
                <span className="lx-cap-ico">{area.icon}</span>
                <span className="lx-cap-n">{area.name}</span>
                <span className="lx-cap-c">{area.count}</span>
              </button>
            ) : (
              <span className="lx-cap soon">
                <span className="lx-cap-ico">{area.icon}</span>
                <span className="lx-cap-n">{area.name}</span>
                <span className="lx-cap-c">Em breve</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div id="lx-area-panel" className={'lx-area-panel' + (open ? ' open' : '')} aria-live="polite">
        {open && (
          <>
            <header>
              <span className="lx-cap-ico">{open.icon}</span>
              <b>{open.name}</b>
              <button type="button" className="lx-x" onClick={() => setOpenId(null)} aria-label="Fechar">
                <LpIcon name="X" size={18} />
              </button>
            </header>
            <ul>
              {open.courses.map((course, i) => (
                <Fragment key={i}>{course}</Fragment>
              ))}
            </ul>
            <Link href={HREF.criarConta} className="lx-btn lx-btn-blue">
              Criar conta grátis para explorar
            </Link>
          </>
        )}
      </div>
    </>
  )
}

/* ---- Perguntas frequentes ---- */

/** Perguntas em sanfona: uma aberta por vez (a primeira começa aberta). */
export function FaqList({ items }: { items: readonly (readonly [string, string])[] }) {
  const [openIdx, setOpenIdx] = useState(0)
  return (
    <div className="lx-qas lx-rv">
      {items.map(([q, a], i) => {
        const on = openIdx === i
        return (
          <div key={q} className={'lx-qa' + (on ? ' on' : '')}>
            <h3>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={'lx-qa-' + i}
                id={'lx-qb-' + i}
                onClick={() => setOpenIdx(on ? -1 : i)}
              >
                <span className="lx-qa-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="lx-qa-q">{q}</span>
                <LpIcon name="Plus" size={18} />
              </button>
            </h3>
            <div id={'lx-qa-' + i} role="region" aria-labelledby={'lx-qb-' + i} className="lx-qa-a" hidden={!on}>
              <p>{a}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Atalho fixo no celular: aparece depois do hero e some quando a chamada final entra na tela. */
export function LandingSticky() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    const update = () => {
      const hero = document.querySelector('.lx-hero')
      const final = document.querySelector('.lx-final-sec')
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
    <div className={'lx-sticky' + (on ? ' on' : '')} aria-hidden={!on}>
      <Link href={HREF.cursoGratis} className="lx-btn lx-btn-lime" tabIndex={on ? 0 : -1}>
        Curso grátis
      </Link>
      <Link href={HREF.criarConta} className="lx-btn lx-btn-blue" tabIndex={on ? 0 : -1}>
        Começar gratuitamente
      </Link>
    </div>
  )
}

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
