import Link from 'next/link'
import { Fragment, type CSSProperties } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import {
  COMPARE_FOR,
  COMPARE_ROWS,
  FAQ,
  FREE_COURSE_CHIPS,
  FREE_COURSE_LEARN,
  FREE_COURSE_TITLE,
  HERO_LESSONS,
  HREF,
  INSTAGRAM_URL,
  JOURNEY_STEPS,
  SKILL_BLOBS,
  SKILL_TONES,
  STORY_BLOCKS,
  STORY_MODULES,
  STORY_STEPS,
  TICKER_SKILLS,
} from './data'
import { LpIcon } from './icons'
import { FooterYear, LandingHeader, LandingRoot, LandingSticky, StoryTabs, WhatIsButton } from './LandingClient'

/*
 * Página pública da Folyo (o que aparece em "/" para quem não está logado).
 * Cópia fiel da landing do protótipo (artefato): mesmas classes `lp-*`, textos e animações.
 * Os estilos estão em src/styles/pages/landing.css.
 */

/** Atalho para variáveis CSS no `style` (ex.: atraso da animação `--d`). */
const vars = (v: Record<string, string | number>) => v as CSSProperties

/** Título que entra palavra por palavra. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  return text.split(' ').map((word, i) => (
    <Fragment key={i}>
      {i > 0 && ' '}
      <span className="lp-w">
        <span style={vars({ '--d': `${from + i * 70}ms` })}>{word}</span>
      </span>
    </Fragment>
  ))
}

/** O "f" gigante em degradê (chamada final). */
function BigMark({ size, rotate, className }: { size: number; rotate: number; className: string }) {
  const id = 'lpf-violet-' + className.replace(/\W/g, '')
  return (
    <svg className={'lp-f ' + className} viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6A4DFF" />
          <stop offset="1" stopColor="#E234CF" />
        </linearGradient>
      </defs>
      <MarkPath x={100} y={100} r={96} fill={`url(#${id})`} rotate={rotate} />
    </svg>
  )
}

/** Mini-interface de cada passo do hero (Aprenda, Crie, Mostre). */
function HeroArt({ i }: { i: number }) {
  if (i === 0) {
    return (
      <div className="hx hx-learn" aria-hidden="true">
        <div className="hx-video">
          <span className="hx-playb">
            <LpIcon name="Play" size={14} />
          </span>
          <span className="hx-vbar">
            <span />
          </span>
        </div>
        {HERO_LESSONS.map((lesson, a) => (
          <span key={lesson} className={'hx-lesson' + (a < 2 ? ' done' : '')} style={vars({ '--i': a })}>
            <i>{a < 2 && <LpIcon name="Check" size={11} />}</i>
            {lesson}
          </span>
        ))}
        <span className="hx-skill">+ skill</span>
      </div>
    )
  }
  if (i === 1) {
    return (
      <div className="hx hx-create" aria-hidden="true">
        <div className="hx-doc-top">
          <span />
          <span />
          <span />
        </div>
        <span className="hx-blk b1">
          <em />
          Pesquisa
        </span>
        <span className="hx-blk b2">
          <em />
          Proposta
        </span>
        <span className="hx-blk b3">
          <em />
          Peças
        </span>
        <span className="hx-cursor">
          <LpIcon name="MousePointerClick" size={16} />
        </span>
      </div>
    )
  }
  return (
    <div className="hx hx-show" aria-hidden="true">
      <div className="hx-card">
        <div className="hx-cover">
          <svg viewBox="0 0 40 40" width="26" height="26">
            <MarkPath x={20} y={20} r={17} fill="#fff" />
          </svg>
        </div>
        <div className="hx-card-t">
          <b />
          <small />
        </div>
        <span className="hx-ok">
          <LpIcon name="BadgeCheck" size={13} />
          Demonstrado
        </span>
      </div>
      <span className="hx-tags">
        <i>Projeto</i>
        <i>Portfólio</i>
      </span>
    </div>
  )
}

function Hero() {
  return (
    <section className="lp-hero" aria-labelledby="lp-title">
      <div className="lp-hero-glow" aria-hidden="true" />
      <div className="lp-hero-in">
        <div className="lp-hero-text">
          <p className="lp-kicker lp-in" style={vars({ '--d': '0ms' })}>
            <span className="lp-dot" />
            Aprenda. Crie. Conquiste.
          </p>
          <h1 id="lp-title" className="lp-title">
            <span className="lp-line">
              <Words text="Não basta dizer" from={80} />
            </span>
            <span className="lp-line">
              <Words text="que você sabe." from={300} />
            </span>
            <span className="lp-line lp-line-hl">
              <span className="lp-hlwrap">
                <span className="lp-w lp-hl">
                  <span style={vars({ '--d': '520ms' })}>Mostre.</span>
                </span>
                <svg className="lp-swoosh" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M4 16 C 70 4, 160 4, 296 12" pathLength="1" />
                </svg>
              </span>
            </span>
          </h1>
          <p className="lp-lead lp-in" style={vars({ '--d': '700ms' })}>
            Aprenda uma habilidade, crie um <b>projeto real</b> e saia com <b>algo concreto para mostrar</b>.
          </p>
          <div className="lp-ctas lp-in" style={vars({ '--d': '800ms' })}>
            <Link href={HREF.cursoGratis} className="btn btn-lg btn-go lp-btn lp-btn-free">
              <LpIcon name="Sparkles" size={17} />
              <span>Acessar curso grátis</span>
            </Link>
            <WhatIsButton />
          </div>
          <ul className="lp-checks lp-in" style={vars({ '--d': '880ms' })}>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Cursos com projeto prático
            </li>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Conta grátis
            </li>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Curso gratuito para começar
            </li>
          </ul>
        </div>
        <div id="como-funciona" className="lp-journey-wrap">
          <ol className="lp-journey" aria-label="Como funciona">
            {JOURNEY_STEPS.map((step, i) => (
              <li
                key={step.k}
                className="lp-jstep lp-in"
                style={vars({ '--d': `${960 + i * 160}ms`, '--sd': `${1.2 + i * 0.5}s` })}
              >
                <HeroArt i={i} />
                <div className="lp-jstep-t">
                  <span className="lp-jn" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3>{step.k}</h3>
                    <p>{step.text}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="lp-ticker" aria-hidden="true">
        <div className="lp-ticker-track">
          {[0, 1].map((run) => (
            <div key={run} className="lp-ticker-run">
              {TICKER_SKILLS.map((skill) => (
                <span key={skill}>
                  {skill}
                  <svg viewBox="0 0 24 24" width="14" height="14">
                    <MarkPath x={12} y={12} r={10} fill={SKILL_TONES[skill] ? SKILL_TONES[skill].edge : '#C9E23F'} />
                  </svg>
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---- A história da Marina (quadros de cada aba) ---- */

function StoryBefore() {
  return (
    <div className="mf mf-before">
      <div className="mf-profile">
        <span className="mf-av">M</span>
        <div>
          <b>Marina</b>
          <small>Quer o primeiro estágio em marketing</small>
        </div>
      </div>
      <p className="mf-say">“Eu sei marketing.”</p>
      <dl className="mf-facts">
        <div>
          <dt>Experiência profissional</dt>
          <dd className="no">Ainda não tem</dd>
        </div>
        <div>
          <dt>Projetos para mostrar</dt>
          <dd className="no">Nenhum</dd>
        </div>
      </dl>
    </div>
  )
}

function StoryLearn() {
  return (
    <div className="mf mf-learn">
      <div className="mf-course">
        <span className="mf-course-ico">
          <LpIcon name="Play" size={16} />
        </span>
        <div>
          <small>Curso</small>
          <b>Fundamentos de marketing</b>
        </div>
        <span className="mf-pct">75%</span>
      </div>
      <span className="mf-bar">
        <span />
      </span>
      <ul className="mf-mods">
        {STORY_MODULES.map(([name, done], i) => (
          <li key={name} className={done ? 'done' : 'now'} style={vars({ '--i': i })}>
            <i>{done ? <LpIcon name="Check" size={12} /> : <LpIcon name="Play" size={10} />}</i>
            {name}
          </li>
        ))}
      </ul>
      <div className="mf-skills">
        <span>Marketing</span>
        <span>Comunicação</span>
      </div>
    </div>
  )
}

function StoryCreate() {
  return (
    <div className="mf mf-create">
      <div className="mf-doc-h">
        <span className="mf-brand">Aurora Café</span>
        <span className="mf-pill">Projeto em construção</span>
      </div>
      <p className="mf-doc-t">Plano de comunicação digital</p>
      <ul className="mf-blocks">
        {STORY_BLOCKS.map((block, i) => (
          <li key={block} style={vars({ '--i': i })}>
            <i>
              <LpIcon name="Check" size={11} />
            </i>
            {block}
            {i === 5 && (
              <span className="mf-pieces">
                <em className="p1">Bom dia começa aqui</em>
                <em className="p2" />
                <em className="p3" />
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function StoryShow() {
  return (
    <div className="mf mf-show">
      <p className="mf-port">Portfólio · Marina</p>
      <div className="mf-pcard">
        <div className="mf-pcover">
          <span className="mf-sun" />
          <b>Aurora Café</b>
          <small>campanha digital</small>
        </div>
        <div className="mf-pbody">
          <b>Plano de comunicação digital</b>
          <span className="mf-ptags">
            <i>Marketing</i>
            <i>Comunicação</i>
          </span>
          <span className="mf-pok">
            <LpIcon name="BadgeCheck" size={15} />
            Projeto concluído
          </span>
        </div>
      </div>
      <div className="mf-quote">
        <span className="was">“Eu sei marketing.”</span>
        <LpIcon name="ArrowRight" size={16} />
        <span className="now">“Olha o projeto que eu fiz.”</span>
      </div>
    </div>
  )
}

function WhatIs() {
  return (
    <section id="o-que-e" className="lp-sec lp-paper" aria-labelledby="lp-what">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-reveal">
          <p className="eyebrow">Exemplo ilustrativo</p>
          <h2 id="lp-what" className="lp-h2">
            Do “eu sei” ao <span className="lp-mark">“olha o que eu fiz”</span>.
          </h2>
        </div>
        <div className="lp-reveal">
          <StoryTabs
            steps={STORY_STEPS}
            frames={[<StoryBefore key="0" />, <StoryLearn key="1" />, <StoryCreate key="2" />, <StoryShow key="3" />]}
          />
        </div>
        <p className="story-note lp-reveal">
          Marina e a Aurora Café são personagens fictícias, criadas para ilustrar como funciona a Folyo.
        </p>
      </div>
    </section>
  )
}

/** Comparação em diagrama: "só conhecimento" x "conhecimento aplicado". */
function Compare() {
  return (
    <section className="lp-sec lp-ink lp-cmp" aria-labelledby="lp-cmp-t">
      <div className="lp-wrap">
        <h2 id="lp-cmp-t" className="lp-h2 lp-cmp-title lp-reveal">
          Saber é o começo. <span>Mostrar faz a diferença.</span>
        </h2>
        <div className="lp-cmp-rows">
          {COMPARE_ROWS.map((row, e) => (
            <div key={row.k} className={'lp-cmp-row ' + row.cls + ' lp-reveal'} style={vars({ '--d': `${e * 140}ms` })}>
              <span className="lp-cmp-k">
                {e === 1 && (
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <MarkPath x={12} y={12} r={10} fill="#C9E23F" />
                  </svg>
                )}
                {row.k}
                {e === 1 && <em>Folyo</em>}
              </span>
              <ol>
                {row.nodes.map(([icon, label], i) => (
                  <li key={label} className={i === 2 ? 'end' : ''} style={vars({ '--i': i })}>
                    <span className="ico-b">
                      <LpIcon name={icon} size={18} />
                    </span>
                    {label}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="lp-cmp-note lp-reveal">O certificado continua valendo. O projeto mostra o que ele significa.</p>
        <div className="lp-for lp-reveal">
          <span>Para quem busca</span>
          <ul>
            {COMPARE_FOR.map(([icon, label]) => (
              <li key={label}>
                <LpIcon name={icon} size={15} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function FreeCourse() {
  return (
    <section id="curso-gratis" className="lp-sec lp-free" aria-labelledby="lp-free-t">
      <div className="lp-free-bg" aria-hidden="true" />
      <div className="lp-wrap lp-free-grid">
        <div className="lp-free-text lp-reveal">
          <span className="lp-badge">
            <LpIcon name="Sparkles" size={14} />
            Curso gratuito
          </span>
          <h2 id="lp-free-t" className="lp-free-title">
            {FREE_COURSE_TITLE}
          </h2>
          <p className="lp-free-lead">Comece de graça. Chegue mais preparado.</p>
          <ul className="lp-free-chips">
            {FREE_COURSE_CHIPS.map(([icon, label]) => (
              <li key={label}>
                <LpIcon name={icon} size={14} />
                {label}
              </li>
            ))}
          </ul>
          <div className="lp-free-cta">
            <Link href={HREF.cursoGratis} className="btn btn-lg btn-go lp-btn lp-btn-free">
              <span>Quero acessar o curso grátis</span>
              <LpIcon name="ArrowRight" size={17} />
            </Link>
            <small>Grátis. Só precisa de uma conta.</small>
          </div>
        </div>
        <div className="lp-free-card lp-reveal" style={vars({ '--d': '140ms' })}>
          <header>
            <p className="eyebrow">O que você vai aprender</p>
            <span className="plan free">Gratuito</span>
          </header>
          <ul className="lp-learn">
            {FREE_COURSE_LEARN.map(([icon, label], i) => (
              <li key={label} style={vars({ '--i': i })}>
                <span className="lp-learn-ico">
                  <LpIcon name={icon} size={17} />
                </span>
                {label}
              </li>
            ))}
          </ul>
          <svg className="lp-free-card-f" viewBox="0 0 100 100" aria-hidden="true">
            <MarkPath x={50} y={50} r={46} fill="rgba(201,226,63,.16)" rotate={12} />
          </svg>
        </div>
      </div>
    </section>
  )
}

function Why() {
  return (
    <section id="por-que" className="lp-sec lp-ink" aria-labelledby="lp-why">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-reveal">
          <p className="eyebrow">Por que a Folyo?</p>
          <h2 id="lp-why" className="lp-h2">
            Aprenda, aplique, mostre.
          </h2>
        </div>
        <div className="lp-bento">
          <article className="lp-tile lp-tile-cv lp-reveal">
            <div className="lp-tile-t">
              <h3>Demonstre suas habilidades.</h3>
              <p>Projetos e certificados no seu currículo e portfólio.</p>
            </div>
            <div className="lp-cv" aria-hidden="true">
              <span className="lp-cv-h" />
              <span className="lp-cv-l" />
              <span className="lp-cv-l s" />
              <span className="lp-cv-item a">
                <LpIcon name="Award" size={14} />
                <em />
              </span>
              <span className="lp-cv-item b">
                <LpIcon name="Paperclip" size={14} />
                <em />
              </span>
            </div>
          </article>
          <article className="lp-tile lp-tile-skills lp-reveal" style={vars({ '--d': '90ms' })}>
            <div className="lp-blobs" aria-hidden="true">
              {SKILL_BLOBS.map(([skill, left, top, r], i) => (
                <span
                  key={skill}
                  className="lp-blob"
                  style={vars({
                    left: left + '%',
                    top: top + '%',
                    '--r': r + '%',
                    background: SKILL_TONES[skill].edge,
                    color: SKILL_TONES[skill].ink,
                    '--bd': `${-i * 1.7}s`,
                  })}
                >
                  {r > 20 ? skill : ''}
                </span>
              ))}
            </div>
            <div className="lp-tile-t">
              <h3>Construa seu caminho.</h3>
              <p>Skills e projetos crescendo juntos no seu perfil.</p>
            </div>
          </article>
          <article className="lp-tile lp-tile-goal lp-reveal" style={vars({ '--d': '60ms' })}>
            <div className="lp-tile-t">
              <h3>Aprenda na prática.</h3>
              <p>Cada aula leva a algo que você vai fazer.</p>
            </div>
            <div className="lp-flow" aria-hidden="true">
              <span className="lp-flow-a">
                <LpIcon name="Play" size={14} />
                Aula
              </span>
              <span className="lp-flow-line" />
              <span className="lp-flow-b">
                <LpIcon name="SquarePen" size={14} />
                Atividade do projeto
              </span>
            </div>
          </article>
          <article className="lp-tile lp-tile-resume lp-reveal" style={vars({ '--d': '150ms' })}>
            <div className="lp-tile-t">
              <h3>Crie projetos reais.</h3>
              <p>Trabalhos seus, em PDF ou link.</p>
            </div>
            <div className="lp-fan" aria-hidden="true">
              <span className="f1">
                <LpIcon name="FileText" size={16} />
              </span>
              <span className="f2">
                <LpIcon name="Link" size={16} />
              </span>
              <span className="f3">
                <LpIcon name="BadgeCheck" size={16} />
              </span>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="duvidas" className="lp-sec lp-paper lp-faq" aria-labelledby="lp-faq-t">
      <div className="lp-wrap lp-faq-grid">
        <div className="lp-sec-head lp-reveal">
          <p className="eyebrow">Dúvidas</p>
          <h2 id="lp-faq-t" className="lp-h2">
            Perguntas frequentes
          </h2>
          <p className="lp-sub">Respostas rápidas antes de começar.</p>
        </div>
        <div className="lp-faq-list lp-reveal" style={vars({ '--d': '100ms' })}>
          {FAQ.map(([q, a], i) => (
            <details key={q} className="lp-qa" open={i === 0}>
              <summary>
                <span>{q}</span>
                <LpIcon name="Plus" size={18} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCall() {
  return (
    <section className="lp-final" aria-labelledby="lp-final-t">
      <BigMark size={620} rotate={10} className="lp-final-f" />
      <div className="lp-wrap lp-final-in lp-reveal">
        <h2 id="lp-final-t" className="lp-final-title">
          Seu conhecimento <span>merece ser visto.</span>
        </h2>
        <p>Comece grátis. Termine com algo para mostrar.</p>
        <div className="lp-final-ctas">
          <Link href={HREF.criarConta} className="btn btn-lg btn-primary lp-btn lp-btn-glow">
            <span>Criar minha conta grátis</span>
            <LpIcon name="ArrowRight" size={17} />
          </Link>
          <Link href={HREF.entrar} className="lp-textlink">
            Já tenho conta
          </Link>
        </div>
      </div>
    </section>
  )
}

function Footer({ tagline }: { tagline: string }) {
  return (
    <footer className="lp-foot">
      <div className="lp-wrap lp-foot-in">
        <div className="lp-foot-brand">
          <Wordmark height={34} tone="violet" />
          <p className="lp-foot-slogan">Aprenda. Crie. Conquiste.</p>
          <p className="lp-foot-tag">{tagline}</p>
        </div>
        <nav className="lp-foot-nav" aria-label="Rodapé">
          <div>
            <p className="eyebrow">Plataforma</p>
            <Link href={HREF.criarConta}>Criar conta</Link>
            <Link href={HREF.entrar}>Entrar</Link>
            <Link href={HREF.cursoGratis}>Curso gratuito</Link>
          </div>
          <div>
            <p className="eyebrow">Acompanhe</p>
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              <LpIcon name="Instagram" size={16} />
              @use.folyo
              <LpIcon name="ArrowUpRight" size={14} />
            </a>
          </div>
        </nav>
      </div>
      <div className="lp-wrap lp-foot-base">
        <small>
          © <FooterYear /> Folyo
        </small>
      </div>
    </footer>
  )
}

/** A landing inteira. `tagline` vem das Configurações do painel (frase do rodapé). */
export function Landing({ tagline }: { tagline: string }) {
  return (
    <LandingRoot>
      <LandingHeader />
      <main id="lp-main" tabIndex={-1}>
        <Hero />
        <WhatIs />
        <Compare />
        <FreeCourse />
        <Why />
        <Faq />
        <FinalCall />
      </main>
      <Footer tagline={tagline} />
      <LandingSticky />
    </LandingRoot>
  )
}
