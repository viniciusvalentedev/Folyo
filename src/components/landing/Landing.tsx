import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import { Art } from '@/components/ui/Art'
import { formatMinutes, plural } from '@/lib/format'
import {
  AREAS,
  COURSES,
  FAQ,
  FREE_COURSE,
  HOW_STEPS,
  HREF,
  INSTAGRAM_URL,
  LESSONS_PER_WEEK,
  NAV_SECTIONS,
  PATHS,
  PROGRESS_FEATURES,
  SKILL_BUBBLES,
  SKILL_TONES,
  STUDY_DAYS,
  UI_NAV,
  WANT_TILTS,
  WANTS,
  type LandingCourse,
} from './data'
import { LpIcon } from './icons'
import {
  AreaCaps,
  FaqList,
  FooterYear,
  LandingHeader,
  LandingRoot,
  LandingSticky,
  ProgressScene,
  SectionLink,
  SpinBadge,
  UiDashTop,
  type AreaItem,
} from './LandingClient'

/*
 * Página pública da Folyo (o que aparece em "/" para quem não está logado).
 * Cópia fiel da landing do protótipo (artefato): mesmas classes `lx-*`, textos e animações.
 * Os estilos estão em src/styles/pages/landing.css.
 */

/** Atalho para variáveis CSS no `style` (ex.: atraso da animação `--d`). */
const vars = (v: Record<string, string | number>) => v as CSSProperties

/* ---------------------------------------------------------------------------------------------
 * Roteiro da cena "Aparelhos → Meu progresso" (ProgressScene, em LandingClient.tsx)
 *
 * No desktop, a pessoa rola e a cena avança de 0 a 1. Cada peça com a classe `k` anima dentro da
 * sua janela [início, fim] (`--s`/`--e` no style; o JS dá o progresso da peça e o landing.css anima).
 * Números que contam usam os mesmos valores em `data-*` (o JS troca o texto).
 * Sem a cena (celular, movimento reduzido, sem JS) nada disso vale: tudo aparece pronto.
 * ------------------------------------------------------------------------------------------- */

type Win = readonly [number, number]

const T = {
  hint: [0, 0.05],
  press: [0.05, 0.15],
  devOut: [0.12, 0.28],
  waveA: [0.12, 0.3],
  waveB: [0.18, 0.36],
  title: [0.26, 0.36],
  skill: [0.3, 0.38],
  study: [0.45, 0.53],
  studyNum: [0.47, 0.6],
  streak: [0.55, 0.61],
  streakNum: [0.58, 0.7],
  cert: [0.61, 0.67],
  certNum: [0.64, 0.7],
  lessons: [0.65, 0.71],
  lessonsNum: [0.67, 0.79],
  line: [0.68, 0.79],
  heat: [0.71, 0.77],
  goals: [0.75, 0.81],
} as const satisfies Record<string, Win>

/** Bolhas de skill, na ordem em que nascem (índices de SKILL_BUBBLES): Comunicação, Marketing, Tecnologia, Design e Vendas. */
const BUBBLE_ORDER = [1, 0, 2, 3, 4]
const bubbleWin = (i: number): Win => {
  const s = 0.34 + BUBBLE_ORDER.indexOf(i) * 0.035
  return [s, s + 0.05]
}
/** Janelas em cascata: a peça `i` começa `step` depois da anterior e dura `len`. */
const cascade = (start: number, step: number, len: number, i: number): Win => [start + i * step, start + i * step + len]

/** Janela da peça no style (`--s`/`--e`). */
const win = ([s, e]: Win) => vars({ '--s': +s.toFixed(4), '--e': +e.toFixed(4) })

/** Número que conta de `from` até `to` durante a janela (o texto do servidor já é o valor final). */
function count([s, e]: Win, to: number, opts: { from?: number; dec?: number; suffix?: string; linear?: boolean } = {}) {
  return {
    'data-s': +s.toFixed(4),
    'data-e': +e.toFixed(4),
    'data-to': to,
    'data-from': opts.from ?? 0,
    'data-dec': opts.dec ?? 0,
    'data-suffix': opts.suffix ?? '',
    'data-ease': opts.linear ? 'linear' : undefined,
  }
}

/* ---------------------------------------------------------------------------------------------
 * Decorações
 * ------------------------------------------------------------------------------------------- */

/** Estrela de quatro pontas. */
function Star({ className = '', size = 30 }: { className?: string; size?: number }) {
  return (
    <svg className={'lx-star ' + className} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 0 C21.6 12.6 27.4 18.4 40 20 C27.4 21.6 21.6 27.4 20 40 C18.4 27.4 12.6 21.6 0 20 C12.6 18.4 18.4 12.6 20 0 Z" />
    </svg>
  )
}

/** Rabisco ondulado. */
function Squig({ className = '' }: { className?: string }) {
  return (
    <svg className={'lx-squig ' + className} width="52" height="12" viewBox="0 0 52 12" aria-hidden="true">
      <path d="M2 8 C7 2 11 2 15 6 S23 10 27 6 S35 2 39 6 S47 10 50 5" />
    </svg>
  )
}

/** Raios em volta das ilustrações. */
function Burst({ className = '' }: { className?: string }) {
  return (
    <svg className={'lx-burst ' + className} viewBox="-100 -100 200 200" aria-hidden="true">
      {Array.from({ length: 36 }, (_, i) => (
        <path key={i} d={`M -2.2 0 L 0 ${-(i % 2 ? 72 : 96)} L 2.2 0 Z`} transform={`rotate(${i * 10})`} />
      ))}
    </svg>
  )
}

/** O "f" da marca, numa cor só. */
function BrandMark({ size = 40, fill = 'currentColor' }: { size?: number; fill?: string }) {
  return (
    <svg className="lx-mark" width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <MarkPath x={50} y={50} r={46} fill={fill} />
    </svg>
  )
}

/** Órbita (elipse fina) que passa por trás e pela frente dos aparelhos. */
function Orbit({ className, rx, ry }: { className: string; rx: number; ry: number }) {
  return (
    <svg className={'lx-orbit ' + className} viewBox="0 0 400 200" aria-hidden="true">
      <ellipse cx="200" cy="100" rx={rx} ry={ry} />
    </svg>
  )
}

/** Palavra em bloco azul com a dobra em lima (ou o contrário). */
function Tag({ children, tone = 'blue' }: { children: ReactNode; tone?: 'blue' | 'lime' }) {
  return (
    <span className={'lx-tag lx-tag-' + tone}>
      <span>{children}</span>
    </span>
  )
}

/** Palavra em azul. */
function Hi({ children }: { children: ReactNode }) {
  return <span className="lx-hi lx-hi-blue">{children}</span>
}

/* ---------------------------------------------------------------------------------------------
 * Aparelhos e telas em miniatura
 * ------------------------------------------------------------------------------------------- */

function Laptop({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={'lx-laptop ' + className}>
      <div className="lx-lid">
        <div className="lx-scr">{children}</div>
      </div>
      <div className="lx-base" />
    </div>
  )
}

function Tablet({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={'lx-tablet ' + className}>
      <div className="lx-scr">{children}</div>
    </div>
  )
}

function Phone({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={'lx-phone ' + className}>
      <span className="lx-island" />
      <div className="lx-scr">{children}</div>
    </div>
  )
}

/** Capa do curso (arte padrão da Folyo, no tom do curso). */
function CourseArt({ course, ratio = '16 / 10', glyph = true }: { course: LandingCourse; ratio?: string; glyph?: boolean }) {
  return (
    <Art
      tone={course.tone}
      glyph={(glyph && course.glyph) || undefined}
      seed={Math.max(0, COURSES.indexOf(course))}
      ratio={ratio}
    />
  )
}

/** Miniatura do Início: menu lateral, saudação, semana e cursos em andamento. */
function UiDash() {
  const first = COURSES[1] ?? COURSES[0]
  const second = COURSES[2] ?? COURSES[0]
  return (
    <div className="lx-ui ui-dash">
      <aside className="ui-side">
        <Wordmark height={20} tone="lime" className="ui-wm" />
        <ul>
          {UI_NAV.map(([icon, label], i) => (
            <li key={label} className={i === 0 ? 'on' : ''}>
              <LpIcon name={icon} size={11} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="ui-main">
        <UiDashTop />
        <p className="ui-h2">Cursos em andamento</p>
        <div className="ui-row">
          {[first, second].map((course, i) => (
            <div key={i} className="ui-course">
              <CourseArt course={course} />
              <div>
                <small>{course.level}</small>
                <b>{course.title}</b>
                <span className="ui-bar">
                  <i style={{ width: i ? '38%' : '64%' }} />
                </span>
              </div>
            </div>
          ))}
          <div className="ui-skills" aria-hidden="true">
            <i className="b1" />
            <i className="b2" />
            <i className="b3" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Lista de aulas das miniaturas (as duas primeiras concluídas, a terceira em andamento). */
function UiLessons({ titles }: { titles: string[] }) {
  return (
    <ol className="ui-lessons">
      {titles.map((title, i) => (
        <li key={i} className={i < 2 ? 'done' : i === 2 ? 'now' : ''}>
          <span>{i < 2 ? <LpIcon name="Check" size={9} /> : i + 1}</span>
          <em>{title}</em>
        </li>
      ))}
    </ol>
  )
}

/** Miniatura da página de um curso (no tablet). */
function UiCoursePage({ course }: { course: LandingCourse }) {
  return (
    <div className="lx-ui ui-course-page">
      <div className="ui-banner">
        <Art tone="lime" seed={2} ratio="16 / 7" />
      </div>
      <div className="ui-cbody">
        <small className="ui-eyebrow">{course.free ? 'CURSO GRATUITO' : 'CURSO'}</small>
        <b className="ui-ctitle">{course.title}</b>
        <div className="ui-cprog">
          <span className="ui-bar">
            <i style={{ width: '40%' }} />
          </span>
          <small>40%</small>
        </div>
        <UiLessons titles={course.lessons.slice(0, 5).map(([title]) => title)} />
      </div>
    </div>
  )
}

/** Miniatura da sala de aula (player + aula). `wide`: versão do computador, com a lista de aulas. */
function UiLesson({ course, wide = false, play }: { course: LandingCourse; wide?: boolean; play?: Win }) {
  const lesson = course.lessons[2] ?? course.lessons[0]
  return (
    <div className={'lx-ui ui-lesson' + (wide ? ' wide' : '')}>
      <div className="ui-player">
        <span className={'ui-play' + (play ? ' k' : '')} style={play && win(play)}>
          <LpIcon name="Play" size={14} />
        </span>
        <span className="ui-scrub">
          <i />
        </span>
        <small className="ui-time">04:12</small>
      </div>
      <div className="ui-lbody">
        <small className="ui-eyebrow">MÓDULO 1 · AULA 3</small>
        <b className="ui-ltitle">{lesson ? lesson[0] : 'Aula 3'}</b>
        <span className="ui-btn">
          <LpIcon name="Check" size={10} />
          Concluir aula
        </span>
        {wide && <UiLessons titles={course.lessons.slice(0, 4).map(([title]) => title)} />}
      </div>
    </div>
  )
}

/** Miniatura de "Meu progresso" (no celular). */
function UiProgress() {
  return (
    <div className="lx-ui ui-prog">
      <p className="ui-h1 sm">Meu progresso</p>
      <div className="ui-t blue">
        <small>TEMPO DE ESTUDO</small>
        <b>
          4,5<em>h</em>
        </b>
        <div className="ui-bars">
          {[62, 30, 48, 85, 20, 0, 0].map((h, i) => (
            <i key={i} className={i === 3 ? 'now' : ''}>
              <span style={{ height: h + '%' }} />
            </i>
          ))}
        </div>
      </div>
      <div className="ui-two">
        <div className="ui-t magenta">
          <small>SEQUÊNCIA</small>
          <b>
            5<em>dias</em>
          </b>
        </div>
        <div className="ui-t lime">
          <small>CERTIFICADOS</small>
          <b>2</b>
        </div>
      </div>
      <div className="ui-t card">
        <small>METAS</small>
        <div className="ui-rings">
          <i style={vars({ '--p': 72 })} />
          <i style={vars({ '--p': 40 })} />
          <i style={vars({ '--p': 90 })} />
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 1. Hero
 * ------------------------------------------------------------------------------------------- */

function Hero() {
  return (
    <section id="topo" className="lx-hero" aria-labelledby="lx-hero-t">
      <div className="lx-aura" aria-hidden="true" />
      <div className="lx-wrap lx-hero-in">
        <div className="lx-hero-text">
          <h1 id="lx-hero-t" className="lx-h1">
            Seu próximo
            <br className="lx-br" /> <Tag>passo</Tag> começa
            <br className="lx-br" /> com o que você
            <br className="lx-br" /> <Hi>aprende</Hi> hoje.
          </h1>
          <p className="lx-lead">
            Aprenda novas habilidades, explore diferentes áreas do conhecimento e transforme o que você aprende em
            projetos reais. Tudo em um só lugar.
          </p>
          <div className="lx-ctas">
            <Link href={HREF.criarConta} className="lx-btn lx-btn-blue lx-btn-lg lx-glow">
              Começar gratuitamente
            </Link>
            <SectionLink to="conhecer" className="lx-textlink">
              Conhecer a Folyo
              <LpIcon name="ArrowRight" size={18} />
            </SectionLink>
          </div>
          <p className="lx-note">
            <LpIcon name="Check" size={15} />
            Criar a conta é grátis. Não pedimos cartão.
          </p>
        </div>
        <div className="lx-hero-art" aria-hidden="true">
          <Burst className="lx-hero-burst" />
          <span className="lx-arc lx-arc-a" />
          <span className="lx-arc lx-arc-b" />
          <span className="lx-dot lx-dot-blue" />
          <Squig className="lx-hero-sq" />
          <Tablet className="lx-hero-tab">
            <UiCoursePage course={FREE_COURSE} />
          </Tablet>
          <Laptop className="lx-hero-lap">
            <UiDash />
          </Laptop>
          <Phone className="lx-hero-ph">
            <UiProgress />
          </Phone>
          <Orbit className="lx-hero-orbit" rx={196} ry={74} />
          <span className="lx-chip lx-chip-a">
            <i className="c-mag" />
            Skill · Marketing <b>+1 aula</b>
          </span>
          <span className="lx-chip lx-chip-b">
            <LpIcon name="Paperclip" size={14} />
            Projeto enviado
          </span>
          <span className="lx-chip lx-chip-c">
            <LpIcon name="Award" size={14} />
            Certificado
          </span>
          <Star className="lx-hero-st1" size={40} />
          <Star className="lx-hero-st2 lime" size={26} />
          <span className="lx-shadow" />
        </div>
        <SpinBadge />
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 2. Faixa escura: slogan, áreas correndo e os números
 * ------------------------------------------------------------------------------------------- */

const areasWithCourses = AREAS.filter(([id]) => COURSES.some((c) => c.cat === id))

function Band() {
  const names = AREAS.map(([, name]) => name)
  const facts: [string, string][] = [
    ['Grátis', 'para criar sua conta'],
    [String(COURSES.length), COURSES.length === 1 ? 'curso publicado' : 'cursos publicados'],
    [String(AREAS.length), 'áreas do conhecimento'],
    ['3 telas', 'computador, tablet e celular'],
  ]
  return (
    <section id="conhecer" className="lx-band-sec" aria-label="A Folyo em resumo">
      <div className="lx-wrap">
        <div className="lx-band">
          <p className="lx-band-k">
            <Star size={20} className="lime" />
            Aprenda. Crie. Conquiste.
          </p>
          <svg className="lx-band-arrow" width="44" height="12" viewBox="0 0 44 12" aria-hidden="true">
            <path d="M0 6 H42 M36 1 L42 6 L36 11" />
          </svg>
          <div className="lx-marq" aria-hidden="true">
            <div className="lx-marq-in">
              {[...names, ...names].map((name, i) => (
                <span key={i}>{name}</span>
              ))}
            </div>
          </div>
          <p className="sr-only">Áreas: {names.join(', ')}.</p>
        </div>
        <ul className="lx-facts">
          {facts.map(([value, label]) => (
            <li key={label} className="lx-rv">
              <b>{value}</b>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 3. Aparelhos
 * ------------------------------------------------------------------------------------------- */

function Devices() {
  return (
    <section className="lx-sec lx-dev" aria-labelledby="lx-dev-t">
      <div className="lx-wrap lx-dev-grid">
        <div className="lx-dev-text lx-rv k" style={win(T.devOut)}>
          <h2 id="lx-dev-t" className="lx-h2">
            Seu aprendizado <Hi>acompanha</Hi> você.
          </h2>
          <p className="lx-p">
            Assista às suas aulas de onde estiver. Acesse a Folyo pelo computador, tablet ou celular e continue
            desenvolvendo suas habilidades no seu próprio ritmo.
          </p>
          <ul className="lx-badges">
            <li>
              <LpIcon name="Monitor" size={22} />
              <span>
                <small>No</small>Computador
              </span>
            </li>
            <li>
              <LpIcon name="Tablet" size={22} />
              <span>
                <small>No</small>Tablet
              </span>
            </li>
            <li>
              <LpIcon name="Smartphone" size={22} />
              <span>
                <small>No</small>Celular
              </span>
            </li>
          </ul>
          <p className="lx-fine">
            Funciona direto no navegador, sem instalar nada. Seu progresso fica salvo na sua conta.
          </p>
        </div>
        <div className="lx-dev-art lx-rv k" style={win(T.devOut)} aria-hidden="true">
          <span className="lx-arch" />
          <span className="lx-half" />
          <span className="lx-pill-lime" />
          <span className="lx-dot lx-dot-lilac" />
          <Squig className="lx-dev-sq" />
          <Squig className="lx-dev-sq2 lime" />
          <Laptop className="lx-dev-lap">
            <UiLesson course={FREE_COURSE} wide play={T.press} />
          </Laptop>
          <Tablet className="lx-dev-tab">
            <UiCoursePage course={FREE_COURSE} />
          </Tablet>
          <Phone className="lx-dev-ph">
            <UiLesson course={FREE_COURSE} />
          </Phone>
          <Orbit className="lx-dev-orbit" rx={196} ry={70} />
          <span className="lx-chip lx-chip-sync">
            <LpIcon name="RefreshCw" size={14} />
            Continue de onde parou <b>04:12</b>
          </span>
          <Star className="lx-dev-st" size={36} />
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 4. Progresso: painel de exemplo
 * ------------------------------------------------------------------------------------------- */

/** Gráfico de skills: bolhas que se fundem sobre um palco oval azul. */
function SkillsChart() {
  return (
    <div className="lx-skills">
      <svg viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <radialGradient id="lx-oval" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#3B32E6" />
            <stop offset=".62" stopColor="#2D24C8" />
            <stop offset=".86" stopColor="#2D24C8" stopOpacity=".78" />
            <stop offset="1" stopColor="#2D24C8" stopOpacity="0" />
          </radialGradient>
          <filter id="lx-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="b" />
            <feColorMatrix in="b" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -9" result="g" />
            <feComposite in="SourceGraphic" in2="g" operator="atop" />
          </filter>
          {SKILL_BUBBLES.map((s, i) => (
            <radialGradient key={s.k} id={'lx-b' + i} cx="50%" cy="56%" r="58%">
              <stop offset="0" stopColor={SKILL_TONES[s.k].core} />
              <stop offset=".55" stopColor={SKILL_TONES[s.k].edge} stopOpacity=".96" />
              <stop offset="1" stopColor={SKILL_TONES[s.k].edge} />
            </radialGradient>
          ))}
        </defs>
        <ellipse cx="50" cy="31" rx="50" ry="31" fill="url(#lx-oval)" />
        <g filter="url(#lx-goo)">
          {SKILL_BUBBLES.map((s, i) => (
            <circle
              key={s.k}
              className="k"
              style={win(bubbleWin(i))}
              cx={s.x}
              cy={s.y * 0.62}
              r={s.r / 5.4}
              fill={`url(#lx-b${i})`}
            />
          ))}
        </g>
      </svg>
      {SKILL_BUBBLES.map((s, i) => (
        <span
          key={s.k}
          className="lx-bl k"
          style={{
            ...win(bubbleWin(i)),
            left: s.x + '%',
            top: s.y + '%',
            color: SKILL_TONES[s.k].ink,
            fontSize: Math.max(10, s.r / 4.6) + 'px',
          }}
        >
          <b {...count(bubbleWin(i), parseInt(s.v, 10), { suffix: '%' })}>{s.v}</b>
          {s.r > 36 && <small>{s.k}</small>}
        </span>
      ))}
    </div>
  )
}

/** Barras em pílula (horas por dia). */
function PillBars() {
  const max = Math.max(...STUDY_DAYS.map(([, v]) => v), 1e-9)
  return (
    <div className="pbars pbars-lime">
      {STUDY_DAYS.map(([day, v], i) => (
        <div key={day} className={'pbar' + (i === 3 ? ' now' : '') + (v > 0 ? ' on' : '')}>
          <span className="pbar-col">
            <span
              className="pbar-fill k"
              style={{ ...win(cascade(0.49, 0.012, 0.05, i)), height: (v > 0 ? (v / max) * 100 : 0) + '%' }}
            />
          </span>
          <small className="pbar-l">{day}</small>
        </div>
      ))}
    </div>
  )
}

/** Curva suave que passa pelos pontos (mesma conta do protótipo). */
function smoothPath(points: [number, number][]) {
  if (points.length < 2) return ''
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[Math.max(0, i - 1)]
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const [x3, y3] = points[Math.min(points.length - 1, i + 2)]
    d += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`
  }
  return d
}

/** Linha (aulas concluídas por semana). */
function LineChart() {
  const max = Math.max(1, ...LESSONS_PER_WEEK)
  const points = LESSONS_PER_WEEK.map((v, i): [number, number] => [(i / (LESSONS_PER_WEEK.length - 1)) * 100, 92 - (v / max) * 78])
  const d = smoothPath(points)
  return (
    <div className="lchart lchart-lime">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <line key={i} x1="0" x2="100" y1={8 + i * 39} y2={8 + i * 39} className="lc-grid" />
        ))}
        <path d={d + ' L 100 100 L 0 100 Z'} className="lc-area k" style={win(T.line)} />
        <path d={d} className="lc-line k" style={win(T.line)} pathLength={1} />
      </svg>
      {points.map(([x, y], i) => (
        <span
          key={i}
          className="lc-dot on k"
          style={{ ...win(cascade(T.line[0], (T.line[1] - T.line[0]) / points.length, 0.025, i)), left: x + '%', top: y + '%' }}
        />
      ))}
    </div>
  )
}

/** Anel de meta. */
function GoalRing({
  value,
  max,
  tone,
  at,
  children,
}: {
  value: number
  max: number
  tone: string
  at: Win
  children: ReactNode
}) {
  const size = 70
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(1, value / max)
  return (
    <div className={'wring wring-' + tone} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="wr-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="wr-fill k"
          style={{ ...win(at), ...vars({ '--len': +(c * p).toFixed(2) }) }}
          strokeWidth={stroke}
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="wr-in">{children}</span>
    </div>
  )
}

/** Níveis do calendário de atividade de exemplo: sempre os mesmos (sorteio com semente fixa). */
function heatLevels() {
  let seed = 11
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  return Array.from({ length: 34 }, () =>
    Array.from({ length: 7 }, () => {
      const n = next()
      return n < 0.35 ? 0 : n < 0.55 ? 1 : n < 0.75 ? 2 : n < 0.9 ? 3 : 4
    }),
  )
}
const HEAT = heatLevels()

/** Calendário de atividade (34 semanas). */
function HeatMap() {
  return (
    <div className="hmap">
      <div className="hm-body">
        <div className="hm-dow" aria-hidden="true">
          <small>seg</small>
          <small />
          <small>qua</small>
          <small />
          <small>sex</small>
          <small />
          <small />
        </div>
        <div className="hm-grid" style={{ gridTemplateColumns: `repeat(${HEAT.length}, minmax(0, 1fr))` }}>
          {HEAT.flatMap((week, w) =>
            week.map((level, d) => (
              <span
                key={w + '-' + d}
                className={'hm-c k l' + level}
                style={{ ...win(cascade(0.73, 0.0032, 0.03, w + d * 0.4)), gridColumn: w + 1, gridRow: d + 1 }}
              />
            )),
          )}
        </div>
      </div>
    </div>
  )
}

/** Metas de exemplo: [feito, meta, cor, texto]. */
const GOALS = [
  [3.6, 5, 'lime', '72%'],
  [4, 10, 'lilac', '40%'],
  [1, 2, 'magenta', '50%'],
] as const

/**
 * Painel de exemplo do "Meu progresso". Na cena do desktop ele é o fim da animação: cada cartão
 * entra na sua vez (janelas de T). O estado final é exatamente o painel parado.
 */
function ProgressPanel() {
  return (
    <section id="experiencia" className="lx-sec lx-exp" aria-labelledby="lx-exp-t">
      <div className="lx-wrap">
        <div className="lx-center lx-rv k" style={win(T.title)}>
          <Star className="lx-exp-s1" size={28} />
          <Star className="lx-exp-s2 lime" size={30} />
          <Squig className="lx-exp-q1 lime" />
          <Squig className="lx-exp-q2" />
          <h2 id="lx-exp-t" className="lx-h2">
            Seu desenvolvimento em cada <Hi>detalhe</Hi>.
          </h2>
          <p className="lx-p">
            Acompanhe sua evolução, descubra seus hábitos de aprendizagem e visualize tudo o que você está
            conquistando ao longo do caminho.
          </p>
        </div>
        <div
          className="lx-bento lx-rv"
          inert
          role="img"
          aria-label="Exemplo do painel Meu progresso: tempo de estudo, sequência, gráfico de skills, calendário de atividade, metas, aulas concluídas e certificados."
        >
          <div className="lx-b-skill k" style={win(T.skill)}>
            <header>
              <span className="lx-b-k">
                <LpIcon name="Puzzle" size={14} />
                Suas skills
              </span>
              <small>Gráfico de skills</small>
            </header>
            <SkillsChart />
          </div>
          <section className="wtile tone-blue lx-b-study k" style={win(T.study)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3>
                  <LpIcon name="Clock" size={15} />
                  Tempo de estudo
                </h3>
              </header>
              <p className="wd-big">
                <b {...count(T.studyNum, 4.5, { dec: 1 })}>4,5</b>
                <small>h</small>
                <em>esta semana</em>
              </p>
              <PillBars />
            </div>
          </section>
          <section className="wtile tone-magenta lx-b-streak k" style={win(T.streak)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3 className="k" style={win(T.streakNum)}>
                  <LpIcon name="Flame" size={15} />
                  Sequência
                </h3>
              </header>
              <p className="wd-big">
                <b {...count(T.streakNum, 5, { from: 1, linear: true })}>5</b>
                <small>dias seguidos</small>
              </p>
            </div>
          </section>
          <section className="wtile tone-lime lx-b-cert k" style={win(T.cert)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3>
                  <LpIcon name="Award" size={15} />
                  Certificados
                </h3>
              </header>
              <p className="wd-big">
                <b className="k" style={win(T.certNum)} {...count(T.certNum, 2, { linear: true })}>
                  2
                </b>
                <small>conquistados</small>
              </p>
            </div>
          </section>
          <section className="wtile tone-card lx-b-heat k" style={win(T.heat)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3>
                  <LpIcon name="CalendarDays" size={15} />
                  Calendário de atividade
                </h3>
              </header>
              <HeatMap />
            </div>
          </section>
          <section className="wtile tone-card lx-b-goals k" style={win(T.goals)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3>
                  <LpIcon name="Target" size={15} />
                  Metas de estudo
                </h3>
              </header>
              <div className="lx-rings">
                {GOALS.map(([value, max, tone, label], i) => (
                  <GoalRing key={tone} value={value} max={max} tone={tone} at={cascade(0.77, 0.02, 0.09, i)}>
                    <b {...count(cascade(0.77, 0.02, 0.09, i), parseInt(label, 10), { suffix: '%' })}>{label}</b>
                  </GoalRing>
                ))}
              </div>
            </div>
          </section>
          <section className="wtile tone-ink lx-b-lessons k" style={win(T.lessons)}>
            <div className="wd-in">
              <header className="wd-head">
                <h3>
                  <LpIcon name="BookOpen" size={15} />
                  Aulas concluídas
                </h3>
              </header>
              <p className="wd-big">
                <b {...count(T.lessonsNum, 23)}>23</b>
                <small>no total</small>
              </p>
              <LineChart />
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

/** Selos e aviso abaixo do painel (fora do palco da cena: rolam normalmente). */
function ProgressFoot() {
  return (
    <div className="lx-exp-foot">
      <div className="lx-wrap">
        <ul className="lx-feats lx-rv">
          {PROGRESS_FEATURES.map((feature) => (
            <li key={feature}>
              <LpIcon name="Check" size={14} />
              {feature}
            </li>
          ))}
        </ul>
        <p className="lx-fine lx-center-t">
          Imagem ilustrativa do painel. No seu, os números vêm só do que você estuda, e você organiza os widgets do seu
          jeito.
        </p>
      </div>
    </div>
  )
}

/**
 * Aparelhos + painel numa cena só. No desktop o palco fica preso enquanto a pessoa rola: o play do
 * notebook "abre" o painel e as conquistas vão aparecendo. Fora disso, são duas seções comuns.
 */
function DevicesToProgress() {
  return (
    <>
      <ProgressScene>
        <div className="lx-stage">
          <Devices />
          <span className="lx-wave lx-wave-a lx-stage-only k" style={win(T.waveA)} aria-hidden="true" />
          <span className="lx-wave lx-wave-b lx-stage-only k" style={win(T.waveB)} aria-hidden="true" />
          <ProgressPanel />
          <p className="lx-hint lx-stage-only k" style={win(T.hint)} aria-hidden="true">
            <span className="lx-mouse" />
            Role para dar play
          </p>
        </div>
      </ProgressScene>
      <ProgressFoot />
    </>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 5. Sobre a Folyo: prática
 * ------------------------------------------------------------------------------------------- */

function Practice() {
  return (
    <section id="sobre" className="lx-sec lx-prac" aria-labelledby="lx-prac-t">
      <div className="lx-wrap lx-prac-grid">
        <div className="lx-prac-text lx-rv">
          <p className="lx-eyebrow">Sobre a Folyo</p>
          <h2 id="lx-prac-t" className="lx-h2">
            Conhecimento ganha valor quando você coloca em <Tag tone="lime">prática</Tag>.
          </h2>
          <p className="lx-p">
            Na Folyo, aprender é só o começo. Desenvolva novas habilidades, explore diferentes áreas e transforme cada
            aprendizado em algo que você realmente sabe fazer.
          </p>
          <div className="lx-wants" aria-label="Motivos diferentes para aprender">
            {WANTS.map((want, i) => (
              <span key={want} style={vars({ '--r': `${WANT_TILTS[i]}deg` })}>
                {want}
              </span>
            ))}
          </div>
          <p className="lx-common">
            Motivos diferentes, uma coisa em comum:{' '}
            <b>ninguém quer só acesso à informação. Quer saber usar o que aprendeu.</b>
          </p>
          <p className="lx-p sm">
            Por isso os cursos da Folyo ligam cada conteúdo à prática. Nos cursos com projeto, você entrega um trabalho
            seu, em PDF ou link, e ele fica guardado no seu portfólio. Você sai com evidência do que aprendeu, não só
            com um certificado.
          </p>
        </div>
        <div className="lx-prac-art lx-rv" aria-label="Exemplos de caminhos: o que você aprende e o que pode criar">
          <Burst className="lx-prac-burst" />
          <span className="lx-arc lx-arc-c" />
          <Star className="lx-prac-st" size={34} />
          <ul className="lx-sheets">
            {PATHS.map((path, i) => (
              <li key={path.area} className={'lx-sheet lx-sheet-' + path.tone} style={vars({ '--i': i })}>
                <span className="lx-sheet-top">
                  <BrandMark size={22} />
                  <small>Exemplo de caminho</small>
                </span>
                <span className="lx-sheet-k">Você aprende</span>
                <b className="lx-sheet-a">{path.area}</b>
                <span className="lx-sheet-k">e cria</span>
                <span className="lx-sheet-m">{path.make}</span>
              </li>
            ))}
          </ul>
          <p className="lx-fine">
            Exemplos de possibilidades, não promessa de vaga ou resultado. Veja abaixo as áreas que já têm cursos.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 6. Áreas
 * ------------------------------------------------------------------------------------------- */

/** Um curso no painel da área (capa, nível, carga, aulas e projeto). */
function AreaCourse({ course }: { course: LandingCourse }) {
  const meta = [course.level, course.hours ? course.hours + ' h' : null, plural(course.lessons.length, 'aula', 'aulas'), course.free ? 'Gratuito' : null]
  return (
    <li>
      <span className="lx-ap-art">
        <CourseArt course={course} />
      </span>
      <span className="lx-ap-t">
        <b>{course.title}</b>
        <small>{meta.filter(Boolean).join(' · ')}</small>
        {course.project && (
          <small className="lx-ap-p">
            <LpIcon name="Paperclip" size={12} />
            Projeto: {course.project}
          </small>
        )}
      </span>
    </li>
  )
}

function Areas() {
  // Primeiro as áreas com cursos, depois as que ainda estão a caminho.
  const ordered = [...areasWithCourses, ...AREAS.filter((a) => !areasWithCourses.includes(a))]
  const items: AreaItem[] = ordered.map(([id, name, icon]) => {
    const courses = COURSES.filter((c) => c.cat === id)
    return {
      id,
      name,
      icon: <LpIcon name={icon} size={18} />,
      count: plural(courses.length, 'curso', 'cursos'),
      courses: courses.map((course) => <AreaCourse key={course.id} course={course} />),
    }
  })
  return (
    <section id="areas" className="lx-sec lx-areas" aria-labelledby="lx-areas-t">
      <div className="lx-wrap">
        <div className="lx-areas-head lx-rv">
          <div>
            <h2 id="lx-areas-t" className="lx-h2">
              Um universo de <Hi>possibilidades</Hi> para aprender.
            </h2>
            <p className="lx-p">
              Explore diferentes áreas do conhecimento, descubra novos interesses e desenvolva habilidades que fazem
              sentido para seus objetivos.
            </p>
          </div>
          <p className="lx-areas-sum">
            <b>{plural(COURSES.length, 'curso publicado', 'cursos publicados')}</b> em{' '}
            {plural(areasWithCourses.length, 'área', 'áreas')}. As outras áreas estão a caminho.
          </p>
        </div>
        <AreaCaps areas={items} />
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 7. Curso gratuito
 * ------------------------------------------------------------------------------------------- */

function FreeCourse() {
  const course = FREE_COURSE
  const minutes = course.lessons.reduce((sum, [, min]) => sum + (min || 0), 0)
  return (
    <section id="curso-gratis" className="lx-sec lx-free" aria-labelledby="lx-free-t">
      <div className="lx-wrap lx-free-grid">
        <div className="lx-free-art lx-rv" aria-hidden="true">
          <Burst className="lx-free-burst" />
          <span className="lx-arc lx-arc-d" />
          <span className="lx-arc lx-arc-e" />
          <span className="lx-dot lx-dot-blue sm" />
          <div className="lx-cover">
            {/* Sem o glifo: o título do curso já fica escrito sobre a capa. */}
            <CourseArt course={course} glyph={false} />
            <span className="lx-cover-tag">Grátis</span>
            <span className="lx-cover-t">{course.title}</span>
          </div>
          <Orbit className="lx-free-orbit" rx={190} ry={80} />
          <Star className="lx-free-st" size={34} />
          <Star className="lx-free-st2 lime" size={22} />
          <span className="lx-shadow" />
        </div>
        <div className="lx-free-text lx-rv">
          <p className="lx-eyebrow">
            <LpIcon name="Sparkles" size={14} />
            Curso gratuito
          </p>
          <h2 id="lx-free-t" className="lx-h2">
            Comece hoje. O primeiro passo é <Tag>gratuito</Tag>.
          </h2>
          <p className="lx-p">
            Conheça a Folyo com o curso <b>{course.title}</b>. Crie sua conta gratuitamente e comece a aprender.
          </p>
          {course.summary && <p className="lx-p sm">{course.summary}</p>}
          <ul className="lx-free-facts">
            <li>
              <LpIcon name="Play" size={15} />
              {plural(course.lessons.length, 'aula', 'aulas')}
            </li>
            {minutes > 0 && (
              <li>
                <LpIcon name="Clock" size={15} />
                {formatMinutes(minutes)}
              </li>
            )}
            <li>
              <LpIcon name="Signal" size={15} />
              {course.level}
            </li>
            {course.certificate && (
              <li>
                <LpIcon name="Award" size={15} />
                Com certificado
              </li>
            )}
          </ul>
          <div className="lx-ctas">
            <Link href={HREF.cursoGratis} className="lx-btn lx-btn-lime lx-btn-lg">
              Acessar curso grátis
              <LpIcon name="ArrowRight" size={18} />
            </Link>
          </div>
          <p className="lx-note">
            <LpIcon name="Check" size={15} />
            Gratuitos: a conta e este curso. Não precisa comprar nada para começar.
          </p>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 8. Como funciona
 * ------------------------------------------------------------------------------------------- */

function HowItWorks() {
  return (
    <section id="como-funciona" className="lx-sec lx-how" aria-labelledby="lx-how-t">
      <div className="lx-wrap lx-center lx-rv">
        <Star className="lx-how-s1" size={28} />
        <Star className="lx-how-s2 lime" size={26} />
        <Squig className="lx-how-q1 lime" />
        <Squig className="lx-how-q2" />
        <h2 id="lx-how-t" className="lx-h2">
          Como a Folyo <Hi>funciona</Hi>?
        </h2>
        <p className="lx-p">Um caminho simples, do primeiro interesse até aquilo que você constrói.</p>
      </div>
      <div className="lx-ribbon-wrap">
        <svg className="lx-ribbon" viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true">
          <path
            className="r-blue"
            d="M0 270 C 260 250, 330 120, 560 130 L 1440 120 L 1440 30 C 1250 40, 1100 60, 880 60 L 560 60 C 300 60, 220 190, 0 200 Z"
          />
          <rect className="r-lime" x="560" y="74" width="290" height="44" />
        </svg>
        <ol className="lx-wrap lx-steps">
          {HOW_STEPS.map(([icon, title, text], i) => (
            <li key={title} className="lx-step lx-rv" style={vars({ '--d': `${i * 90}ms` })}>
              <span className="lx-step-n">0{i + 1}</span>
              <span className={'lx-step-ico ' + (i % 2 ? 'lime' : 'blue')}>
                <LpIcon name={icon} size={18} />
              </span>
              <b>{title}</b>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </div>
      <div className="lx-wrap lx-how-cta lx-rv">
        <Link href={HREF.criarConta} className="lx-btn lx-btn-blue lx-btn-lg lx-glow">
          Começar gratuitamente
        </Link>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 9. Perguntas frequentes
 * ------------------------------------------------------------------------------------------- */

function Faq() {
  return (
    <section id="duvidas" className="lx-sec lx-faq" aria-labelledby="lx-faq-t">
      <div className="lx-wrap">
        <div className="lx-center lx-rv">
          <Star className="lx-faq-s1" size={30} />
          <span className="lx-dot lx-dot-lilac lx-faq-d" />
          <Squig className="lx-faq-q" />
          <Star className="lx-faq-s2 lime" size={24} />
          <h2 id="lx-faq-t" className="lx-h2">
            Perguntas <Hi>frequentes</Hi>
          </h2>
          <p className="lx-p">Respostas diretas sobre conta, cursos, certificados e projetos.</p>
        </div>
        <FaqList items={FAQ} />
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * 10. Chamada final
 * ------------------------------------------------------------------------------------------- */

function FinalCall() {
  const withProject = COURSES.find((c) => c.project)
  return (
    <section className="lx-sec lx-final-sec" aria-labelledby="lx-final-t">
      <div className="lx-wrap">
        <div className="lx-final">
          <div className="lx-final-art" aria-hidden="true">
            <Burst className="lx-final-burst" />
            <div className="lx-fcard lx-fcard-back">
              <span className="lx-fcard-top">
                <BrandMark size={26} fill="#C9E23F" />
                <small>Certificado</small>
              </span>
              <b>Folyo</b>
              <small className="lx-fcard-f">Aprenda. Crie. Conquiste.</small>
            </div>
            <div className="lx-fcard lx-fcard-front">
              <span className="lx-fcard-top">
                <BrandMark size={26} fill="#2D24C8" />
                <small>Projeto</small>
              </span>
              <small className="lx-fcard-k">Você cria</small>
              <b>{withProject ? withProject.project : 'Seu primeiro projeto'}</b>
              <small className="lx-fcard-f">PDF · Link · Portfólio</small>
            </div>
            <span className="lx-dot lx-dot-lime" />
            <Star className="lx-final-st" size={30} />
            <Squig className="lx-final-sq" />
            <Orbit className="lx-final-orbit" rx={196} ry={86} />
          </div>
          <div className="lx-final-text">
            <h2 id="lx-final-t" className="lx-h2">
              O que você vai <span className="lx-lime">construir</span> com o que aprender?
            </h2>
            <p>
              Seu próximo passo pode começar com uma nova habilidade, uma ideia ou um projeto. Descubra tudo o que você
              pode desenvolver com a Folyo.
            </p>
            <div className="lx-ctas">
              <Link href={HREF.criarConta} className="lx-btn lx-btn-blue lx-btn-lg lx-glow">
                Começar gratuitamente
              </Link>
              <Link href={HREF.entrar} className="lx-textlink on-dark">
                Já tenho conta
                <LpIcon name="ArrowRight" size={18} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------------------------
 * Rodapé
 * ------------------------------------------------------------------------------------------- */

function Footer({ supportEmail }: { supportEmail: string }) {
  return (
    <footer className="lx-foot">
      <div className="lx-wrap">
        <div className="lx-foot-top">
          <div className="lx-foot-brand">
            <Wordmark height={30} tone="violet" />
            <p>
              Cursos, projetos práticos e acompanhamento do seu progresso para você aprender algo novo e colocar em
              prática.
            </p>
            <p className="lx-foot-slogan">Aprenda. Crie. Conquiste.</p>
          </div>
          <nav className="lx-foot-cols" aria-label="Rodapé">
            <div>
              <p>Navegação</p>
              {NAV_SECTIONS.map(([id, label]) => (
                <SectionLink key={id} to={id}>
                  {label}
                </SectionLink>
              ))}
              <SectionLink to="duvidas">Perguntas frequentes</SectionLink>
            </div>
            <div>
              <p>Áreas</p>
              {AREAS.slice(0, 7).map(([id, name]) => (
                <SectionLink key={id} to="areas">
                  {name}
                </SectionLink>
              ))}
            </div>
            <div>
              <p>Sua conta</p>
              <Link href={HREF.criarConta}>Criar conta grátis</Link>
              <Link href={HREF.entrar}>Entrar</Link>
              <Link href={HREF.cursoGratis}>Curso gratuito</Link>
            </div>
            <div>
              <p>Contato</p>
              {supportEmail && (
                <a href={'mailto:' + supportEmail}>
                  <LpIcon name="Mail" size={15} />
                  {supportEmail}
                </a>
              )}
              <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                <LpIcon name="Instagram" size={15} />
                @use.folyo
              </a>
            </div>
          </nav>
        </div>
        <div className="lx-foot-base">
          <small>
            © <FooterYear /> Folyo
          </small>
          <div className="lx-foot-social">
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" aria-label="Instagram da Folyo">
              <LpIcon name="Instagram" size={16} />
            </a>
          </div>
          <div className="lx-foot-legal">
            <Link href={HREF.privacidade}>Privacidade</Link>
            <Link href={HREF.termos}>Termos de uso</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

/**
 * A landing inteira. `supportEmail` vem das Configurações do painel (contato do rodapé);
 * `fontClass` liga a fonte dos títulos (Unbounded), carregada só nesta página.
 */
export function Landing({ supportEmail, fontClass }: { supportEmail: string; fontClass: string }) {
  return (
    <LandingRoot className={fontClass}>
      <LandingHeader />
      <main id="lx-main" tabIndex={-1}>
        <Hero />
        <Band />
        <DevicesToProgress />
        <Practice />
        <Areas />
        <FreeCourse />
        <HowItWorks />
        <Faq />
        <FinalCall />
      </main>
      <Footer supportEmail={supportEmail} />
      <LandingSticky />
    </LandingRoot>
  )
}
