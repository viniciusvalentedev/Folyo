import { GENERIC_SKILLS, findTrail, type Trail } from '@/lib/trails'
import type {
  Catalog,
  Certificate,
  Course,
  CourseStats,
  Derived,
  DoneEntry,
  Evidence,
  Metrics,
  SkillMix,
  SkillWithEvidence,
  UserState,
  WorkEntry,
} from '@/lib/types'
import { brDate } from '@/lib/format'
import { categoryOf, isListed, lessonsOf, normalize, sameText } from './catalog'
import { followsSequence } from './sequence'

/** Data (ms) da última aula concluída de um curso — usada para ordenar "em andamento". */
function lastActivity(state: UserState, course: Course) {
  const dates = lessonsOf(course)
    .map((l) => state.completed[l.id])
    .filter(Boolean)
    .sort()
  return dates.length ? new Date(dates[dates.length - 1]).getTime() : 0
}

/** O curso pede um projeto (PDF ou link) para dar o certificado? */
export const offersProject = (course: Course) => !!course.project?.title?.trim()

/** O curso emite certificado? (por padrão sim; o painel pode desligar.) */
export const issuesCertificate = (course: Course) => course.certificate?.enabled !== false

/** Código do certificado: curso + data + um trecho que vem do e-mail da conta. */
export function certificateCode(courseId: string, date: string, accountEmail: string) {
  let hash = 2166136261
  for (const ch of (accountEmail || '').trim().toLowerCase()) {
    hash ^= ch.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const tail = ('u' + (hash >>> 0).toString(36)).slice(1, 6).toUpperCase()
  const stamp = date.replace(/-/g, '').slice(2)
  return 'FLY-' + courseId.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) + '-' + stamp + '-' + tail
}

/** Lista sem repetidos (ignora acento e maiúsculas) e sem vazios. */
export function uniqueNames(list: string[] | undefined) {
  const seen = new Set<string>()
  return (list ?? []).filter((item) => {
    const key = normalize(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Divide 100% entre as partes sem estourar (as casas que sobram vão para as maiores sobras). */
function roundTo100(values: number[]) {
  if (!values.length) return []
  if (!values.reduce((a, b) => a + b, 0)) return values.map(() => 0)
  const floors = values.map(Math.floor)
  let rest = 100 - floors.reduce((a, b) => a + b, 0)
  const order = values.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let i = 0; i < order.length && rest > 0; i++, rest--) floors[order[i][1]]++
  return floors
}

/** O que o aluno estudou, por skill: cada aula concluída vale 1, dividida entre as skills do curso. */
function computeSkillMix(state: UserState, courses: Course[]): SkillMix {
  const map = new Map<string, SkillMix['items'][number]>()
  let counted = 0
  let uncounted = 0
  for (const course of courses) {
    const done = lessonsOf(course).filter((l) => state.completed[l.id]).length
    if (!done) continue
    const names = uniqueNames(course.skills)
    if (!names.length) {
      uncounted += done
      continue
    }
    counted += done
    for (const name of names) {
      const key = normalize(name)
      const item = map.get(key) ?? { name, value: 0, pct: 0, share: 0, courses: [] }
      item.value += done / names.length
      item.courses.push({ id: course.id, title: course.title, lessons: done, share: 1 / names.length })
      map.set(key, item)
    }
  }
  const items = [...map.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const pcts = roundTo100(items.map((i) => (counted ? (i.value / counted) * 100 : 0)))
  items.forEach((item, i) => {
    item.pct = pcts[i]
    item.share = counted ? item.value / counted : 0
  })
  return { items, counted, uncounted }
}

/**
 * Calcula tudo o que é derivado dos dados do usuário: progresso por curso,
 * certificados, competências com evidências, diagnóstico do currículo etc.
 *
 * É uma função pura (só lê os dados e devolve o resultado).
 *
 * Regra do certificado: todas as aulas concluídas E, se o curso pede projeto, pelo
 * menos um trabalho (PDF ou link) enviado nele.
 */
export function deriveUserData(state: UserState, catalog: Catalog): Derived {
  const courses = catalog.courses
  const courseStats: Record<string, CourseStats> = {}

  for (const course of courses) {
    const lessons = lessonsOf(course)
    const doneLessons = lessons.filter((l) => state.completed[l.id])
    const works = state.works.filter((w) => w.courseId === course.id)
    const offers = offersProject(course)
    const delivered = works.length > 0
    const deliveredAt = delivered ? (works.map((w) => brDate(w.createdAt)).sort()[0] ?? null) : null
    const complete = doneLessons.length === lessons.length
    const started = !!state.started[course.id] || doneLessons.length > 0
    const doneDates = doneLessons.map((l) => state.completed[l.id]).sort()
    const nextLesson = lessons.find((l) => !state.completed[l.id]) ?? null
    const last = state.lastLesson[course.id] ? lessons.find((l) => l.id === state.lastLesson[course.id]) : undefined
    // Aluno em sequência: a "última aula aberta" só vale se for a próxima a fazer (as seguintes estão travadas).
    const lastOk = last && !state.completed[last.id] && (!followsSequence(state.role) || last.id === nextLesson?.id)
    const resume = (lastOk ? last : nextLesson) || last || lessons[0]
    const certified = complete && issuesCertificate(course) && (!offers || delivered)
    const certDate = certified ? ([doneDates[doneDates.length - 1], deliveredAt].filter(Boolean) as string[]).sort().pop()! : null

    courseStats[course.id] = {
      total: lessons.length,
      done: doneLessons.length,
      pct: Math.round((doneLessons.length / lessons.length) * 100),
      complete,
      started,
      status: complete ? 'concluido' : started ? 'iniciado' : 'disponivel',
      startedAt: doneDates[0] ?? null,
      completedAt: complete ? doneDates[doneDates.length - 1] : null,
      nextLesson,
      resume,
      works,
      delivered,
      deliveredAt,
      offersProject: offers,
      certified,
      certDate,
      minutesLeft: lessons.filter((l) => !state.completed[l.id]).reduce((sum, l) => sum + l.min, 0),
    }
  }

  const certificates: Certificate[] = courses
    .filter((c) => courseStats[c.id].certified)
    .map((c) => {
      const date = courseStats[c.id].certDate!
      return {
        id: c.id,
        course: c,
        date,
        code: certificateCode(c.id, date, state.accountEmail),
        inCV: state.resume.certs.includes(c.id),
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const inProgress = courses
    .filter((c) => courseStats[c.id].status === 'iniciado')
    .sort((a, b) => lastActivity(state, b) - lastActivity(state, a))
  const completedCourses = courses.filter((c) => courseStats[c.id].complete)

  // Todos os trabalhos, do mais novo para o mais antigo.
  const works: WorkEntry[] = state.works
    .map((w) => ({ ...w, course: courses.find((c) => c.id === w.courseId) ?? null }))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0))

  // Competências e suas evidências
  const skills: SkillWithEvidence[] = state.skills.map((skill) => {
    const ev: Evidence[] = []
    for (const c of courses) {
      const st = courseStats[c.id]
      if (st.started && c.skills.some((s) => sameText(s, skill.name))) {
        ev.push({
          kind: 'curso',
          label: c.title,
          detail: st.complete ? 'Curso concluído' : `Curso em andamento · ${st.pct}%`,
          to: '/cursos/' + c.id,
          strong: st.complete,
        })
      }
    }
    for (const w of works) {
      if (w.course && w.course.skills.some((s) => sameText(s, skill.name))) {
        ev.push({ kind: 'projeto', label: w.title, detail: 'Projeto enviado · ' + w.course.title, to: '/projetos', strong: true })
      }
    }
    for (const x of state.user.experiences) {
      if ((x.skills || []).some((s) => sameText(s, skill.name))) {
        ev.push({
          kind: 'experiencia',
          label: `${x.role} · ${x.org}`,
          detail: x.kind === 'profissional' ? 'Experiência profissional' : 'Experiência extracurricular',
          to: '/curriculo',
          strong: false,
        })
      }
    }
    for (const cert of certificates) {
      if (cert.course.skills.some((s) => sameText(s, skill.name))) {
        ev.push({
          kind: 'certificado',
          label: 'Certificado · ' + cert.course.title,
          detail: 'Certificado Folyo',
          to: '/certificados',
          strong: true,
        })
      }
    }
    if (skill.note) ev.push({ kind: 'nota', label: skill.note, detail: 'Registro pessoal', strong: false })

    const learned = ev.some((e) => e.kind === 'curso')
    const practiced = ev.some((e) => e.kind === 'projeto' || e.kind === 'experiencia')
    const demonstrated = ev.some((e) => (e.kind === 'projeto' && e.strong) || e.kind === 'certificado')
    return {
      ...skill,
      evidence: ev,
      level: demonstrated ? 3 : practiced ? 2 : learned ? 1 : 0,
      learned,
      practiced,
      demonstrated,
    }
  })

  // Preenchimento do currículo
  const goal = findTrail(catalog.trails, state.goals.primary)
  const hasEnglish = state.user.languages.some((l) => sameText(l.name, 'Inglês'))
  const cvSkills = skills.filter((s) => s.inCV && s.type !== 'idioma')
  const objective = (state.user.objective || '').trim()
  const keywords = catalog.trails.flatMap((t) => t.keywords).concat([
    'administração',
    'vendas',
    'design',
    'dados',
    'atendimento',
    'finanças',
    'arquitetura',
    'programação',
  ])
  const specificObjective = objective.length >= 60 && keywords.some((k) => normalize(objective).includes(normalize(k)))
  /** `generico`: tem texto, mas sem a área (a tela oferece uma sugestão). */
  const objectiveStatus: Derived['objectiveStatus'] = !objective ? 'vazio' : specificObjective ? 'ok' : 'generico'

  const cvProjects = works.filter((w) => w.inCV)
  const certsInCV = certificates.filter((c) => c.inCV)
  const u = state.user
  const checks: { w: number; ok: boolean; partial?: boolean }[] = [
    { w: 10, ok: !!(u.email && u.phone && u.city) }, // contato completo
    { w: 5, ok: !!u.link }, // link de portfólio
    { w: 15, ok: specificObjective }, // objetivo específico
    { w: 10, ok: u.education.length > 0 }, // formação
    { w: 10, ok: u.experiences.length > 0 }, // experiências
    { w: 20, ok: cvProjects.length >= 2, partial: cvProjects.length === 1 }, // projetos
    { w: 10, ok: cvSkills.length >= 5 }, // competências
    { w: 10, ok: hasEnglish }, // idiomas com inglês
    { w: 10, ok: certsInCV.length > 0 || completedCourses.length > 0 }, // cursos ou certificados
  ]
  const completeness = checks.reduce((sum, c) => sum + (c.ok ? c.w : c.partial ? c.w / 2 : 0), 0)

  // Histórico de estudo: uma linha por aula concluída (para o gráfico do início).
  const doneLog: DoneEntry[] = []
  for (const course of courses) {
    for (const lesson of lessonsOf(course)) {
      const date = state.completed[lesson.id]
      if (date) doneLog.push({ lid: lesson.id, cid: course.id, date: date.slice(0, 10) })
    }
  }
  doneLog.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const watchSec = Object.values(state.watch).reduce((sum, s) => sum + (Number(s) || 0), 0)
  const metrics: Metrics = {
    lessonsDone: doneLog.length,
    watchSec,
    coursesCompleted: completedCourses.length,
    coursesStarted: inProgress.length,
    certificates: certificates.length,
    projectsAdded: works.length,
    coursesWithProject: courses.filter((c) => courseStats[c.id].delivered).length,
    attachments: works.length,
    certPending: [...inProgress, ...completedCourses.filter((c) => !courseStats[c.id].certified)].filter(
      (c) => courseStats[c.id].offersProject,
    ).length,
  }

  return {
    courseStats,
    certificates,
    inProgress,
    completedCourses,
    works,
    skills,
    goal,
    objectiveStatus,
    completeness,
    cvProjects,
    lessonsDone: doneLog.length,
    skillMix: computeSkillMix(state, courses),
    metrics,
    doneLog,
  }
}

// ---------- Skills do catálogo e recomendações ----------

export type CatalogSkill = { name: string; courses: string[]; cats: string[] }

/** Skills ensinadas pelos cursos do catálogo, das mais comuns para as menos. */
export function catalogSkills(catalog: Catalog): CatalogSkill[] {
  const map = new Map<string, CatalogSkill>()
  for (const course of catalog.courses) {
    if (!isListed(course)) continue
    for (const name of uniqueNames(course.skills)) {
      const key = normalize(name)
      const item = map.get(key) ?? { name, courses: [], cats: [] }
      item.courses.push(course.id)
      if (!item.cats.includes(course.cat)) item.cats.push(course.cat)
      map.set(key, item)
    }
  }
  return [...map.values()].sort((a, b) => b.courses.length - a.courses.length || a.name.localeCompare(b.name, 'pt-BR'))
}

/** Algum curso do catálogo ensina esta skill? */
export const skillInCatalog = (catalog: CatalogSkill[], name: string) => catalog.some((s) => sameText(s.name, name))

/**
 * A trilha com as skills que o catálogo ensina hoje e os cursos dela. Se o painel escolheu os cursos à mão,
 * valem esses (na ordem escolhida, só os que estão no ar); senão, os que ensinam as skills da trilha.
 */
export function trailWithCourses(trail: Trail | null, catalog: Catalog, skills: CatalogSkill[] = catalogSkills(catalog)) {
  if (!trail) return null
  const listed = catalog.courses.filter((course) => isListed(course))
  let courses: Course[]
  if (trail.courseIds.length) {
    const byId = new Map(listed.map((course) => [course.id, course]))
    courses = trail.courseIds.flatMap((id) => byId.get(id) ?? [])
  } else {
    courses = listed
      .map((course) => ({ course, n: uniqueNames(course.skills).filter((s) => trail.skills.some((t) => sameText(t, s))).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.course)
  }
  return { ...trail, liveSkills: trail.skills.filter((s) => skillInCatalog(skills, s)), liveCourses: courses }
}

const STOP_WORDS = new Set([
  'construir', 'carreira', 'tornar', 'tornar-me', 'profissional', 'desenvolver', 'habilidades', 'aprender',
  'minha', 'quero', 'trabalhar', 'sobre', 'para', 'como', 'começar', 'criar', 'administrar', 'uma', 'meus',
  'minhas', 'ser',
])

function significantWords(text: string) {
  return [
    ...new Set(
      normalize(text)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
    ),
  ]
}

export type Recommendation = { course: Course; matched: string[]; textHit: boolean; started: boolean; score: number }

/** Cursos ainda não concluídos que ensinam as skills que o aluno quer desenvolver. */
export function recommendCourses(state: UserState, derived: Derived, catalog: Catalog): Recommendation[] {
  const wanted = state.goals.skills
  if (!wanted.length) return []
  const words = significantWords(state.goals.text)
  const out: Recommendation[] = []
  for (const course of catalog.courses) {
    const stats = derived.courseStats[course.id]
    if (!stats || stats.complete || !isListed(course, stats.started)) continue
    const matched = uniqueNames(course.skills).filter((s) => wanted.some((w) => sameText(w, s)))
    if (!matched.length) continue
    const haystack = normalize(
      [course.title, course.summary, categoryOf(catalog, course.cat).name, course.skills.join(' ')].join(' '),
    )
    const textHit = words.some((w) => haystack.includes(w))
    out.push({
      course,
      matched,
      textHit,
      started: stats.started,
      score: matched.length * 10 + (textHit ? 3 : 0) + (stats.started ? 2 : 0) + (course.recommended ? 4 : 0),
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

/** Sugestão de objetivo profissional a partir da trilha escolhida. */
export function suggestedObjective(state: UserState, trails: readonly Trail[]) {
  const trail = findTrail(trails, state.goals.primary)
  const byTrail: Record<string, string> = {
    marketing: 'Estágio em marketing, com foco em pesquisa de público e posicionamento de marca para pequenos negócios.',
    estagio: 'Primeiro estágio em administração, com foco em atendimento, vendas e organização de processos.',
    programacao: 'Estágio em desenvolvimento de software, começando por projetos web em JavaScript.',
    vendas: 'Estágio em vendas consultivas, com foco em atendimento e relacionamento com clientes.',
    ingles: 'Estágio em empresa com atuação internacional, usando inglês no dia a dia.',
    familia: 'Atuar na gestão da empresa da família, com foco em fluxo de caixa, atendimento e vendas.',
    criativo: 'Estágio em design ou arquitetura, desenvolvendo projetos visuais e de espaço.',
  }
  return (trail && byTrail[trail.id]) || 'Estágio em administração, com foco em atendimento e vendas para pequenos negócios.'
}

/** Skills sugeridas na escolha de skills em Objetivos (as do aluno, as da trilha e as do catálogo). */
export function suggestedGoalSkills(state: UserState, catalog: Catalog, limit = 18) {
  const catalogList = catalogSkills(catalog)
  const trail = trailWithCourses(findTrail(catalog.trails, state.goals.primary), catalog, catalogList)
  const out: string[] = []
  const add = (name: string) => {
    if (!out.some((n) => sameText(n, name))) out.push(name)
  }
  state.goals.skills.forEach(add)
  ;(trail?.liveSkills ?? []).forEach(add)
  catalogList.forEach((s) => out.length < limit && add(s.name))
  GENERIC_SKILLS.forEach((s) => out.length < limit && add(s))
  return { skills: out, catalogList }
}
