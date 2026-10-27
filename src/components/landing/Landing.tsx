import Link from 'next/link'
import { Fragment, type CSSProperties } from 'react'
import { MarkPath, Wordmark } from '@/components/brand/Logo'
import {
  AUDIENCE,
  FAQ,
  FREE_COURSE_LEARN,
  FREE_COURSE_TITLE,
  HREF,
  INSTAGRAM_URL,
  JOURNEY_STEPS,
  SKILL_BLOBS,
  SKILL_TONES,
  TICKER_SKILLS,
} from './data'
import { LpIcon } from './icons'
import { FooterYear, LandingHeader, LandingRoot, LandingSticky, WhatIsButton } from './LandingClient'

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

/** Mini-ilustração de cada passo do "Como funciona". */
function StepArt({ i }: { i: number }) {
  if (i === 0) {
    return (
      <div className="lp-sa lp-sa-learn" aria-hidden="true">
        <span className="lp-sa-play">
          <LpIcon name="Play" size={16} />
        </span>
        {[0, 1, 2].map((a) => (
          <span key={a} className={'lp-sa-row' + (a < 2 ? ' done' : '')} style={vars({ '--i': a })}>
            <i>
              <LpIcon name="Check" size={12} />
            </i>
            <em />
          </span>
        ))}
      </div>
    )
  }
  if (i === 1) {
    return (
      <div className="lp-sa lp-sa-make" aria-hidden="true">
        <span className="lp-sa-drop">
          <LpIcon name="FileUp" size={22} />
          <small>PDF ou link</small>
        </span>
      </div>
    )
  }
  return (
    <div className="lp-sa lp-sa-win" aria-hidden="true">
      <span className="lp-sa-cert">
        <svg viewBox="0 0 40 40" width="34" height="34">
          <MarkPath x={20} y={20} r={17} fill="#DD33CF" />
        </svg>
        <em />
        <em className="s" />
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
            <span className="lp-line lp-line-1">
              <Words text="Seu próximo" from={80} />{' '}
              <span className="lp-hlwrap">
                <span className="lp-w lp-hl">
                  <span style={vars({ '--d': '240ms' })}>projeto</span>
                </span>
                <svg className="lp-swoosh" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M4 16 C 70 4, 160 4, 296 12" pathLength="1" />
                </svg>
              </span>
            </span>
            <span className="lp-line">
              <Words text="começa aqui." from={340} />
            </span>
          </h1>
          <p className="lp-lead lp-in" style={vars({ '--d': '560ms' })}>
            A Folyo é uma plataforma de <b>cursos online curtos e práticos</b>. Você assiste às aulas, faz um projeto de
            verdade e sai com <b>certificado e currículo</b> prontos para mostrar.
          </p>
          <div className="lp-ctas lp-in" style={vars({ '--d': '680ms' })}>
            <Link href={HREF.cursoGratis} className="btn btn-lg btn-go lp-btn lp-btn-free">
              <LpIcon name="Sparkles" size={17} />
              <span>Acessar curso grátis</span>
            </Link>
            <WhatIsButton />
          </div>
          <ul className="lp-checks lp-in" style={vars({ '--d': '780ms' })}>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Criar conta é grátis
            </li>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Curso gratuito para começar
            </li>
            <li>
              <LpIcon name="CircleCheck" size={16} />
              Estude pelo celular ou computador
            </li>
          </ul>
        </div>
        <div id="como-funciona" className="lp-journey-wrap">
          <p className="lp-journey-t lp-in" style={vars({ '--d': '860ms' })}>
            Como funciona, em 3 passos
          </p>
          <ol className="lp-journey">
            {JOURNEY_STEPS.map((step, i) => (
              <li key={step.k} className="lp-jstep lp-in" style={vars({ '--d': `${960 + i * 160}ms` })}>
                <StepArt i={i} />
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

function WhatIs() {
  return (
    <section id="o-que-e" className="lp-sec lp-paper" aria-labelledby="lp-what">
      <div className="lp-wrap">
        <div className="lp-sec-head lp-reveal">
          <p className="eyebrow">Para quem nunca ouviu falar</p>
          <h2 id="lp-what" className="lp-h2">
            O que é a Folyo?
          </h2>
          <p className="lp-sub lp-sub-big">
            É um lugar para <b>aprender fazendo</b>. Em vez de só assistir, você termina cada curso com um projeto
            pronto e um certificado no seu nome. Tudo vai para o seu currículo, para você mostrar o que sabe fazer em
            entrevistas e processos seletivos.
          </p>
        </div>
        <div className="lp-ba">
          <div className="lp-ba-card lp-ba-before lp-reveal">
            <span className="lp-ba-tag">Só estudar</span>
            <div className="lp-ba-cv" aria-hidden="true">
              <span className="lp-ba-name" />
              <span className="lp-ba-l" />
              <span className="lp-ba-l s" />
              <span className="lp-ba-empty">
                Experiência prática: <em>nada para mostrar</em>
              </span>
            </div>
            <p>Você aprende, mas não tem como provar.</p>
          </div>
          <div className="lp-ba-arrow" aria-hidden="true">
            <LpIcon name="ArrowRight" size={22} />
          </div>
          <div className="lp-ba-card lp-ba-after lp-reveal" style={vars({ '--d': '140ms' })}>
            <span className="lp-ba-tag on">Com a Folyo</span>
            <div className="lp-ba-cv" aria-hidden="true">
              <span className="lp-ba-name" />
              <span className="lp-ba-l" />
              <span className="lp-ba-row r1">
                <LpIcon name="Award" size={15} />
                Certificado em seu nome
              </span>
              <span className="lp-ba-row r2">
                <LpIcon name="Paperclip" size={15} />
                Projeto prático no portfólio
              </span>
              <span className="lp-ba-row r3">
                <LpIcon name="Puzzle" size={15} />
                Skills que você desenvolveu
              </span>
            </div>
            <p>Você aprende e sai com provas do que sabe fazer.</p>
          </div>
        </div>
        <div className="lp-who lp-reveal">
          <p className="lp-who-t">
            <b>Para quem é.</b> Para quem quer se preparar para o mercado de trabalho, em qualquer momento:
          </p>
          <ul>
            {AUDIENCE.map((a) => (
              <li key={a.id}>
                <LpIcon name={a.icon} size={16} />
                {a.title}
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
          <p className="lp-free-lead">Prepare-se melhor para as oportunidades que podem transformar sua trajetória.</p>
          <p className="lp-free-desc">
            Aprenda a entender os processos seletivos, organizar sua preparação e apresentar suas habilidades com mais
            estratégia e confiança.
          </p>
          <div className="lp-free-cta">
            <Link href={HREF.cursoGratis} className="btn btn-lg btn-go lp-btn lp-btn-free">
              <span>Quero acessar o curso grátis</span>
              <LpIcon name="ArrowRight" size={17} />
            </Link>
            <small>Sem custo. Você só precisa de uma conta na Folyo.</small>
          </div>
        </div>
        <div className="lp-free-card lp-reveal" style={vars({ '--d': '140ms' })}>
          <header>
            <p className="eyebrow">O que você vai aprender</p>
            <span className="plan free">Gratuito</span>
          </header>
          <ul className="lp-learn">
            {FREE_COURSE_LEARN.map((item, i) => (
              <li key={item} style={vars({ '--i': i })}>
                <LpIcon name="CircleCheck" size={18} />
                {item}
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
            O que você aprende fica registrado a seu favor.
          </h2>
        </div>
        <div className="lp-bento">
          <article className="lp-tile lp-tile-cv lp-reveal">
            <div className="lp-tile-t">
              <LpIcon name="FileUser" size={22} />
              <h3>Um currículo que se monta enquanto você estuda</h3>
              <p>
                Certificados e projetos entram no seu currículo da Folyo com um clique. Você escolhe o que mostrar e em
                que ordem.
              </p>
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
              <h3>Suas skills ganham forma</h3>
              <p>Cada aula concluída alimenta o gráfico das suas skills. Você enxerga onde está evoluindo.</p>
            </div>
          </article>
          <article className="lp-tile lp-tile-goal lp-reveal" style={vars({ '--d': '60ms' })}>
            <div className="lp-tile-t">
              <LpIcon name="Route" size={22} />
              <h3>Um objetivo, um caminho</h3>
              <p>
                Escolha aonde quer chegar, como conseguir o primeiro estágio ou construir carreira em Marketing, e veja
                os cursos que levam até lá.
              </p>
            </div>
            <div className="lp-route" aria-hidden="true">
              <i />
              <i />
              <i />
              <span />
            </div>
          </article>
          <article className="lp-tile lp-tile-resume lp-reveal" style={vars({ '--d': '150ms' })}>
            <div className="lp-tile-t">
              <LpIcon name="History" size={22} />
              <h3>Retome de onde parou</h3>
              <p>A Folyo guarda a última aula de cada curso e mostra o seu ritmo de estudo por semana.</p>
            </div>
            <div className="lp-resume" aria-hidden="true">
              <span className="lp-resume-play">
                <LpIcon name="Play" size={14} />
              </span>
              <span className="lp-resume-bar">
                <span />
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
          <p className="lp-sub">Tudo o que você precisa saber antes de criar sua conta.</p>
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
          O próximo passo <span>começa com você.</span>
        </h2>
        <p>Conheça a Folyo, explore novas possibilidades e comece sua jornada.</p>
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
