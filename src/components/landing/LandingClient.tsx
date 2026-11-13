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
    // Dentro da cena animada (ProgressScene ligada) quem controla a entrada é o scroll, não este efeito.
    const items = [...root.querySelectorAll<HTMLElement>('.lx-rv')].filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92 && !el.closest('.lx-scene.on'),
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

/** Valor de 0 a 1. */
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Posição do elemento dentro de um ancestral posicionado (ignora transform, então não muda com a animação). */
function offsetIn(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { x, y }
}

/** Número contado pela cena (`data-*` vindos de `count()` em Landing.tsx). */
type Counter = {
  el: HTMLElement
  s: number
  e: number
  from: number
  to: number
  dec: number
  suffix: string
  linear: boolean
  final: string
  shown: string
}

const numberFormat = (dec: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

/**
 * Cena "Aparelhos → Meu progresso" (scrollytelling).
 *
 * No desktop (sem movimento reduzido) o palco `.lx-stage` fica preso (sticky) enquanto a pessoa rola
 * a pista `.lx-scene.on`. Com o progresso da pista (0 a 1), cada peça `k` recebe o seu próprio
 * progresso (`--lx-t`, dentro da janela `--s`/`--e`) direto no style, sem re-render do React; o CSS
 * faz o resto. Só as peças cuja janela está andando são tocadas, para o navegador recalcular pouco
 * a cada quadro. O scroll é o nativo: só lemos a posição.
 * Sem JS, no celular/tablet ou com movimento reduzido a classe `on` não entra e as seções ficam paradas.
 */
export function ProgressScene({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scene = ref.current
    const stage = scene?.querySelector<HTMLElement>('.lx-stage')
    const fitBox = scene?.querySelector<HTMLElement>('.lx-exp > .lx-wrap')
    const play = scene?.querySelector<HTMLElement>('.lx-dev-lap .ui-play')
    if (!scene || !stage || !fitBox || !play) return

    const formats = new Map<number, Intl.NumberFormat>()
    const format = (n: number, dec: number) => {
      let f = formats.get(dec)
      if (!f) formats.set(dec, (f = numberFormat(dec)))
      return f.format(n)
    }
    // O valor final vem dos `data-*` (e não do texto atual, que a própria cena muda enquanto anima).
    const counters: Counter[] = [...scene.querySelectorAll<HTMLElement>('[data-to]')].map((el) => {
      const dec = Number(el.dataset.dec ?? 0)
      const suffix = el.dataset.suffix ?? ''
      const to = Number(el.dataset.to)
      return {
        el,
        s: Number(el.dataset.s),
        e: Number(el.dataset.e),
        from: Number(el.dataset.from ?? 0),
        to,
        dec,
        suffix,
        linear: el.dataset.ease === 'linear',
        final: format(to, dec) + suffix,
        shown: el.textContent ?? '',
      }
    })

    // Peças animadas e as suas janelas (vindas do style que o servidor escreveu).
    const pieces = [...scene.querySelectorAll<HTMLElement | SVGElement>('.k')].map((el) => ({
      el,
      s: parseFloat(el.style.getPropertyValue('--s')),
      e: parseFloat(el.style.getPropertyValue('--e')),
      t: -1,
    }))

    const wide = matchMedia('(min-width: 1021px) and (min-height: 600px)')
    const calm = matchMedia('(prefers-reduced-motion: reduce)')
    let armed = false
    let near = false
    let top = 0
    let track = 1
    let frame = 0
    let lastP = -1

    const setText = (c: Counter, text: string) => {
      if (c.shown !== text) c.el.textContent = c.shown = text
    }

    const render = () => {
      frame = 0
      if (!armed) return
      const p = clamp01((window.scrollY - top) / track)
      if (p === lastP) return
      lastP = p
      scene.classList.toggle('at-start', p < 0.02)
      for (const piece of pieces) {
        const t = Math.round(clamp01((p - piece.s) / (piece.e - piece.s)) * 1e4) / 1e4
        if (t !== piece.t) piece.el.style.setProperty('--lx-t', String((piece.t = t)))
      }
      for (const c of counters) {
        const t = clamp01((p - c.s) / (c.e - c.s))
        const k = c.linear ? t : t * t * (3 - 2 * t)
        const value = c.from + (c.to - c.from) * k
        const shown = c.dec ? value : Math.round(value)
        setText(c, t >= 1 ? c.final : format(shown, c.dec) + c.suffix)
      }
    }
    const schedule = () => {
      if (armed && near && !frame) frame = requestAnimationFrame(render)
    }

    /** Medidas que só mudam com o tamanho da tela ou da página (nunca a cada frame). */
    const measure = () => {
      if (!armed) return
      top = scene.getBoundingClientRect().top + window.scrollY
      track = Math.max(1, scene.offsetHeight - window.innerHeight)
      // O painel inteiro precisa caber no palco abaixo do cabeçalho fixo: diminui um pouco se faltar altura.
      const head = document.querySelector<HTMLElement>('.lx-head')?.offsetHeight ?? 82
      const fit = Math.min(1, (stage.clientHeight - head - 56) / Math.max(1, fitBox.offsetHeight))
      scene.style.setProperty('--fit', fit.toFixed(3))
      scene.style.setProperty('--hd', head + 'px')
      // As ondas saem do botão de play do notebook e crescem até cobrir o palco todo.
      const at = offsetIn(play, stage)
      const ox = at.x + play.offsetWidth / 2
      const oy = at.y + play.offsetHeight / 2
      const w = stage.clientWidth
      const h = stage.clientHeight
      const reach = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy))
      scene.style.setProperty('--ox', ox.toFixed(1) + 'px')
      scene.style.setProperty('--oy', oy.toFixed(1) + 'px')
      scene.style.setProperty('--reach', Math.ceil(reach) + 'px')
      lastP = -1
      render()
    }

    const update = () => {
      const should = wide.matches && !calm.matches && !document.documentElement.classList.contains('calm')
      if (should === armed) return measure()
      armed = should
      scene.classList.toggle('on', armed)
      if (armed) {
        // Peças que o efeito de revelar já tinha escondido aparecem: aqui quem manda é o scroll.
        scene.querySelectorAll('.lx-rv').forEach((el) => el.classList.add('is-in'))
        measure()
      } else {
        cancelAnimationFrame(frame)
        frame = 0
        lastP = -1
        for (const name of ['--fit', '--hd', '--ox', '--oy', '--reach']) scene.style.removeProperty(name)
        scene.classList.remove('at-start')
        for (const piece of pieces) {
          piece.el.style.removeProperty('--lx-t')
          piece.t = -1
        }
        counters.forEach((c) => setText(c, c.final))
      }
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        near = entry.isIntersecting
        // Ao sair da tela, um último quadro deixa a cena no começo (0) ou no fim (1), mesmo após um scroll rápido.
        if (!near && armed) render()
        schedule()
      },
      { rootMargin: '50% 0px' },
    )
    io.observe(scene)
    const ro = new ResizeObserver(() => measure())
    ro.observe(document.body)
    window.addEventListener('scroll', schedule, { passive: true })
    wide.addEventListener('change', update)
    calm.addEventListener('change', update)
    update()

    return () => {
      cancelAnimationFrame(frame)
      counters.forEach((c) => setText(c, c.final))
      pieces.forEach((piece) => piece.el.style.removeProperty('--lx-t'))
      scene.classList.remove('on', 'at-start')
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('scroll', schedule)
      wide.removeEventListener('change', update)
      calm.removeEventListener('change', update)
    }
  }, [])

  return (
    <div className="lx-scene" ref={ref}>
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
