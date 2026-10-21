'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, type CSSProperties } from 'react'
import { CourseArt, CourseCard, CourseRow, FavButton } from '@/components/course/CourseBits'
import { useApp } from '@/components/providers/AppState'
import { Button } from '@/components/ui/Button'
import { Seg, Select } from '@/components/ui/controls'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/indicators'
import { categoryOf, findCourse, normalize } from '@/lib/domain/catalog'
import { plural } from '@/lib/format'
import type { Course, CourseStatus, Level } from '@/lib/types'

type Duration = 'all' | 'short' | 'mid' | 'long'
type Sort = 'relevancia' | 'catalogo' | 'curtos'

const DURATIONS: { value: Duration; label: string }[] = [
  { value: 'all', label: 'Qualquer duração' },
  { value: 'short', label: 'Até 5 h' },
  { value: 'mid', label: '5 a 10 h' },
  { value: 'long', label: 'Mais de 10 h' },
]

const fitsDuration = (h: number, f: Duration) =>
  f === 'all' || (f === 'short' && h <= 5) || (f === 'mid' && h > 5 && h <= 10) || (f === 'long' && h > 10)

export function ExploreView() {
  const { s, d, catalog } = useApp()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [level, setLevel] = useState<'Todos' | Level>('Todos')
  const [duration, setDuration] = useState<Duration>('all')
  const [plan, setPlan] = useState<'all' | 'free' | 'pro'>('all')
  const [situation, setSituation] = useState<'all' | CourseStatus>('all')
  const [sort, setSort] = useState<Sort>('relevancia')
  const [onlyFav, setOnlyFav] = useState(false)

  const filtering =
    !!q || cat !== 'all' || level !== 'Todos' || duration !== 'all' || plan !== 'all' || onlyFav || situation !== 'all'
  const goalCourses = useMemo(() => d.goal?.courses ?? [], [d.goal])
  const courses = catalog.courses

  const results = useMemo(() => {
    const term = normalize(q.trim())
    const order = (c: Course) => courses.indexOf(c)
    const list = courses.filter((c) => {
      const st = d.courseStats[c.id]
      const haystack = [c.title, c.summary, c.skills.join(' '), categoryOf(catalog, c.cat).name, c.project.title].join(' ')
      if (term && !normalize(haystack).includes(term)) return false
      if (cat !== 'all' && c.cat !== cat) return false
      if (level !== 'Todos' && c.level !== level) return false
      if (!fitsDuration(c.hours, duration)) return false
      if (plan !== 'all' && c.plan !== plan) return false
      if (onlyFav && !s.favorites.includes(c.id)) return false
      if (situation !== 'all' && st.status !== situation) return false
      return true
    })
    const score = (c: Course) =>
      (goalCourses.includes(c.id) ? 10 : 0) +
      (d.courseStats[c.id].status === 'iniciado' ? 5 : 0) +
      (term && normalize(c.title).includes(term) ? 20 : 0) +
      (c.featured ? 3 : 0) -
      order(c) / 1000
    if (sort === 'catalogo') return [...list].sort((a, b) => order(a) - order(b))
    if (sort === 'curtos') return [...list].sort((a, b) => a.hours - b.hours)
    return [...list].sort((a, b) => score(b) - score(a))
  }, [q, cat, level, duration, plan, onlyFav, situation, sort, courses, catalog, d.courseStats, s.favorites, goalCourses])

  const clear = () => {
    setQ('')
    setCat('all')
    setLevel('Todos')
    setDuration('all')
    setPlan('all')
    setOnlyFav(false)
    setSituation('all')
  }

  const countByCat = useMemo(
    () => Object.fromEntries(catalog.categories.map((c) => [c.id, courses.filter((x) => x.cat === c.id).length])),
    [catalog.categories, courses],
  )
  const featured = courses.find((c) => c.featured) ?? null
  const forGoal = goalCourses
    .map((id) => findCourse(catalog, id))
    .filter((c): c is Course => !!c && d.courseStats[c.id].status !== 'concluido')

  return (
    <div className="page surface-paper explore">
      <header className="explore-head rise">
        <p className="eyebrow">Explorar cursos</p>
        <h1 className="display-xl">
          O que você quer <span className="u-mark">saber fazer</span>?
        </h1>
        <div className="explore-search">
          <Icon name="Search" size={20} />
          <input
            type="search"
            value={q}
            maxLength={80}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busque por habilidade, área ou projeto. Ex.: negociação, planilha, portfólio"
            aria-label="Buscar cursos"
            id="explore-q"
          />
          {q && (
            <button type="button" className="icon-btn" aria-label="Limpar busca" onClick={() => setQ('')}>
              <Icon name="X" size={16} />
            </button>
          )}
        </div>
      </header>

      <div className="cat-rail rise" style={{ '--i': 1 } as CSSProperties} role="group" aria-label="Áreas profissionais">
        <button type="button" className={'cat-chip' + (cat === 'all' ? ' on' : '')} onClick={() => setCat('all')}>
          <Icon name="Layers" size={16} />
          Todas
        </button>
        {catalog.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={'cat-chip' + (cat === c.id ? ' on' : '') + (countByCat[c.id] ? '' : ' soon')}
            onClick={() => setCat(cat === c.id ? 'all' : c.id)}
            aria-pressed={cat === c.id}
          >
            <Icon name={c.icon} size={16} />
            {c.name}
            <i>{countByCat[c.id] || 'em breve'}</i>
          </button>
        ))}
      </div>

      <div className="filters rise" style={{ '--i': 2 } as CSSProperties}>
        <Seg
          label="Nível"
          value={level}
          onChange={setLevel}
          options={['Todos', 'Iniciante', 'Intermediário', 'Avançado']}
          size="sm"
        />
        <Select id="f-dur" label="Duração" value={duration} onChange={setDuration} options={DURATIONS} />
        <Select
          id="f-plan"
          label="Plano"
          value={plan}
          onChange={setPlan}
          options={[
            { value: 'all', label: 'Gratuitos e Pro' },
            { value: 'free', label: 'Gratuitos' },
            { value: 'pro', label: 'Plano Pro' },
          ]}
        />
        <Select
          id="f-state"
          label="Situação"
          value={situation}
          onChange={setSituation}
          options={[
            { value: 'all', label: 'Qualquer situação' },
            { value: 'disponivel', label: 'Não iniciados' },
            { value: 'iniciado', label: 'Em andamento' },
            { value: 'concluido', label: 'Concluídos' },
          ]}
        />
        <button
          type="button"
          className={'filter-fav' + (onlyFav ? ' on' : '')}
          aria-pressed={onlyFav}
          onClick={() => setOnlyFav(!onlyFav)}
        >
          <Icon name="Heart" size={15} />
          Favoritos
          <i>{s.favorites.length}</i>
        </button>
        <div className="filters-sort">
          <label htmlFor="f-sort" className="muted">
            Ordenar
          </label>
          <Select
            id="f-sort"
            label="Ordenar"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'relevancia', label: 'Relevância' },
              { value: 'catalogo', label: 'Ordem do catálogo' },
              { value: 'curtos', label: 'Mais curtos' },
            ]}
          />
        </div>
      </div>

      {filtering ? (
        <section className="results">
          <header className="section-head">
            <h2>
              {plural(results.length, 'curso encontrado', 'cursos encontrados')}
              {cat !== 'all' && <span className="muted"> em {categoryOf(catalog, cat).name}</span>}
            </h2>
            <button type="button" className="link-btn" onClick={clear}>
              Limpar filtros
            </button>
          </header>
          {results.length ? (
            <div className="grid-cards">
              {results.map((c, i) => (
                <CourseCard key={c.id} course={c} i={i} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="SearchX"
              title="Nenhum curso com esses filtros"
              action={
                <Button variant="quiet" onClick={clear}>
                  Limpar filtros
                </Button>
              }
            >
              {cat !== 'all' && !countByCat[cat]
                ? `Ainda não há cursos em ${categoryOf(catalog, cat).name}. A área entra no catálogo em breve.`
                : 'Tente outro termo ou remova algum filtro.'}
            </EmptyState>
          )}
        </section>
      ) : (
        <>
          {featured && (
            <section
              className="feature rise"
              style={{ '--i': 3 } as CSSProperties}
              onClick={() => router.push('/cursos/' + featured.id)}
            >
              <CourseArt course={featured} ratio="auto" className="feature-art" big />
              <div className="feature-body">
                <p className="eyebrow">Em destaque · {categoryOf(catalog, featured.cat).name}</p>
                <h2>{featured.title}</h2>
                <p>{featured.summary}</p>
                <dl className="feature-meta">
                  <div>
                    <dt>Nível</dt>
                    <dd>{featured.level}</dd>
                  </div>
                  <div>
                    <dt>Duração</dt>
                    <dd>{featured.hours} h</dd>
                  </div>
                  <div>
                    <dt>Você vai publicar</dt>
                    <dd>{featured.project.title}</dd>
                  </div>
                </dl>
                <div className="row gap-s">
                  <Button
                    variant="primary"
                    iconRight="ArrowRight"
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push('/cursos/' + featured.id)
                    }}
                  >
                    {d.courseStats[featured.id].started ? 'Continuar' : 'Conhecer o curso'}
                  </Button>
                  <FavButton cid={featured.id} />
                </div>
              </div>
            </section>
          )}

          {d.inProgress.length > 0 && (
            <section className="explore-sec rise" style={{ '--i': 4 } as CSSProperties}>
              <header className="section-head">
                <h2>Continue de onde parou</h2>
              </header>
              <div className="grid-2">
                {d.inProgress.map((c) => (
                  <CourseRow key={c.id} course={c} />
                ))}
              </div>
            </section>
          )}

          {forGoal.length > 0 && d.goal && (
            <section className="explore-sec rise" style={{ '--i': 5 } as CSSProperties}>
              <header className="section-head">
                <div>
                  <h2>Para o seu objetivo</h2>
                  <p className="muted">Selecionados para &quot;{d.goal.title}&quot;.</p>
                </div>
                <button type="button" className="link-btn" onClick={() => router.push('/objetivos')}>
                  Mudar objetivo
                </button>
              </header>
              <div className="grid-cards">
                {forGoal.slice(0, 3).map((c, i) => (
                  <CourseCard key={c.id} course={c} i={i} />
                ))}
              </div>
            </section>
          )}

          <section className="explore-sec">
            <header className="section-head">
              <h2>Áreas profissionais</h2>
            </header>
            <div className="area-grid">
              {catalog.categories
                .filter((c) => countByCat[c.id])
                .map((c) => (
                  <button key={c.id} type="button" className="area-tile" onClick={() => setCat(c.id)}>
                    <Icon name={c.icon} size={22} />
                    <b>{c.name}</b>
                    <small>{plural(countByCat[c.id], 'curso', 'cursos')}</small>
                  </button>
                ))}
            </div>
          </section>

          <section className="explore-sec">
            <header className="section-head">
              <h2>Todo o catálogo</h2>
              <span className="muted">{plural(courses.length, 'curso', 'cursos')}</span>
            </header>
            <div className="grid-cards">
              {results.map((c, i) => (
                <CourseCard key={c.id} course={c} i={i % 6} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
