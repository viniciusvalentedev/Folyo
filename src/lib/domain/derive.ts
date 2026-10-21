import type {
  Catalog,
  Certificate,
  Course,
  CourseStats,
  Derived,
  Evidence,
  ResumeCheck,
  ResumeGap,
  SkillWithEvidence,
  UserState,
} from '@/lib/types'
import { findGoal, lessonsOf, normalize, sameText } from './catalog'

/** Data (ms) da última aula concluída de um curso — usada para ordenar "em andamento". */
function lastActivity(state: UserState, course: Course) {
  const dates = lessonsOf(course)
    .map((l) => state.completed[l.id])
    .filter(Boolean)
    .sort()
  return dates.length ? new Date(dates[dates.length - 1]).getTime() : 0
}

/**
 * Calcula tudo o que é derivado dos dados do usuário: progresso por curso,
 * certificados, competências com evidências, diagnóstico do currículo etc.
 *
 * É uma função pura (só lê os dados e devolve o resultado), então continua
 * servindo quando os dados passarem a vir do banco.
 */
export function deriveUserData(state: UserState, catalog: Catalog): Derived {
  const courses = catalog.courses
  const courseStats: Record<string, CourseStats> = {}

  for (const course of courses) {
    const lessons = lessonsOf(course)
    const doneLessons = lessons.filter((l) => state.completed[l.id])
    const project = state.projects.find((p) => p.courseId === course.id) ?? null
    const complete = doneLessons.length === lessons.length
    const started = !!state.started[course.id] || doneLessons.length > 0
    const doneDates = doneLessons.map((l) => state.completed[l.id]).sort()
    const nextLesson = lessons.find((l) => !state.completed[l.id]) ?? null
    const last = state.lastLesson[course.id] ? lessons.find((l) => l.id === state.lastLesson[course.id]) : undefined
    const resume = (last && !state.completed[last.id] ? last : nextLesson) || last || lessons[0]
    const certified = complete && !!project && project.status === 'concluido'
    const certDate = certified ? [doneDates[doneDates.length - 1], project!.completedAt ?? ''].sort().pop()! : null

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
      project,
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
        code: 'FLY-DEMO-' + c.id.toUpperCase().slice(0, 3) + '-' + date.replace(/-/g, '').slice(2),
        inCV: state.resume.certs.includes(c.id),
      }
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  const inProgress = courses
    .filter((c) => courseStats[c.id].status === 'iniciado')
    .sort((a, b) => lastActivity(state, b) - lastActivity(state, a))
  const completedCourses = courses.filter((c) => courseStats[c.id].complete)
  const projectsDone = state.projects.filter((p) => p.status === 'concluido')

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
    for (const p of state.projects) {
      if (p.skills.some((s) => sameText(s, skill.name))) {
        ev.push({
          kind: 'projeto',
          label: p.title,
          detail:
            p.status === 'concluido'
              ? 'Projeto concluído'
              : p.status === 'revisao'
                ? 'Projeto em revisão'
                : 'Projeto em andamento',
          to: '/projetos/' + p.id,
          strong: p.status === 'concluido',
        })
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
          detail: 'Demonstração',
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

  // Diagnóstico do currículo
  const goal = findGoal(catalog, state.goals.primary)
  const hasSkill = (name: string) => state.skills.some((s) => sameText(s.name, name))
  const unregisteredCourseSkills = [...new Set(completedCourses.flatMap((c) => c.skills).filter((s) => !hasSkill(s)))]
  const projectsOutOfCV = projectsDone.filter((p) => !state.resume.projects.includes(p.id))
  const certsOutOfCV = certificates.filter((c) => !c.inCV)
  const hasEnglish = state.user.languages.some((l) => sameText(l.name, 'Inglês'))
  const cvSkills = skills.filter((s) => s.inCV && s.type !== 'idioma')
  const cvSkillsNoEvidence = cvSkills.filter(
    (s) => s.level === 0 || (!s.practiced && !s.demonstrated && s.type !== 'ferramenta'),
  )
  const objective = (state.user.objective || '').trim()
  const keywords = catalog.goals
    .flatMap((g) => g.keywords)
    .concat(['administração', 'vendas', 'design', 'dados', 'atendimento', 'finanças', 'arquitetura', 'programação'])
  const specificObjective = objective.length >= 60 && keywords.some((k) => normalize(objective).includes(normalize(k)))

  const gaps: ResumeGap[] = []
  if (!objective) {
    gaps.push({
      id: 'obj-empty',
      sev: 'alta',
      title: 'Seu currículo ainda não tem objetivo profissional.',
      body: 'Uma frase com a área e o tipo de oportunidade ajuda quem lê a entender o que você procura.',
      action: 'focus-objetivo',
      cta: 'Escrever objetivo',
    })
  } else if (!specificObjective) {
    gaps.push({
      id: 'obj-generic',
      sev: 'alta',
      title: 'Seu objetivo profissional está genérico.',
      body: goal
        ? `Você escolheu "${goal.title}" como objetivo principal, mas o texto do currículo não cita a área. Experimente especificar a área e o tipo de vaga.`
        : 'Experimente especificar a área desejada e o tipo de oportunidade.',
      action: 'suggest-objetivo',
      cta: 'Ver sugestão',
    })
  }
  if (projectsOutOfCV.length) {
    gaps.push({
      id: 'proj-out',
      sev: 'alta',
      title: `${projectsOutOfCV.length === 1 ? 'Você tem 1 projeto concluído' : `Você tem ${projectsOutOfCV.length} projetos concluídos`} fora do currículo.`,
      body: projectsOutOfCV.map((p) => p.title).join(' · '),
      action: 'add-projects',
      cta: projectsOutOfCV.length === 1 ? 'Incluir no currículo' : 'Incluir todos',
      ids: projectsOutOfCV.map((p) => p.id),
    })
  }
  if (!hasEnglish) {
    gaps.push({
      id: 'lang',
      sev: 'media',
      title: 'Seu currículo ainda não informa o nível de inglês.',
      body: 'Muitas vagas pedem essa informação. Informe o nível atual, mesmo que seja básico.',
      action: 'focus-idiomas',
      cta: 'Informar nível',
    })
  }
  if (unregisteredCourseSkills.length) {
    gaps.push({
      id: 'skills-course',
      sev: 'media',
      title: 'Você concluiu cursos com competências ainda não registradas.',
      body: unregisteredCourseSkills.join(' · '),
      action: 'register-skills',
      cta: 'Registrar competências',
      names: unregisteredCourseSkills,
    })
  }
  if (certsOutOfCV.length) {
    gaps.push({
      id: 'cert-out',
      sev: 'baixa',
      title: `${certsOutOfCV.length === 1 ? 'Um certificado não aparece' : `${certsOutOfCV.length} certificados não aparecem`} no currículo.`,
      body: certsOutOfCV.map((c) => c.course.title).join(' · '),
      action: 'add-certs',
      cta: 'Incluir',
      ids: certsOutOfCV.map((c) => c.id),
    })
  }
  if (cvSkillsNoEvidence.length) {
    gaps.push({
      id: 'skills-noev',
      sev: 'baixa',
      title: 'Algumas competências do currículo ainda não têm projetos que as demonstrem.',
      body: cvSkillsNoEvidence.map((s) => s.name).join(' · '),
      action: 'go-skills',
      cta: 'Ver competências',
    })
  }
  if (!state.user.link) {
    gaps.push({
      id: 'link',
      sev: 'baixa',
      title: 'Falta um link para seu portfólio ou perfil profissional.',
      body: 'Com o link, quem lê o currículo pode ver os projetos completos.',
      action: 'add-link',
      cta: 'Usar link do portfólio',
    })
  }

  const strengths: string[] = []
  const pro = state.user.experiences.filter((x) => x.kind === 'profissional')
  if (pro.length) strengths.push(`Experiência prática registrada: ${pro.map((x) => x.org).join(', ')}`)
  const cvProjects = state.projects.filter((p) => state.resume.projects.includes(p.id))
  const withResult = cvProjects.filter((p) => /\d/.test(p.result || ''))
  if (withResult.length) {
    strengths.push(
      `${withResult.length} ${withResult.length === 1 ? 'projeto com resultado descrito' : 'projetos com resultados descritos'} no currículo`,
    )
  }
  const certsInCV = certificates.filter((c) => c.inCV)
  if (certsInCV.length) {
    strengths.push(
      `${certsInCV.length} ${certsInCV.length === 1 ? 'certificado incluído' : 'certificados incluídos'}`,
    )
  }
  const demonstratedInCV = skills.filter((s) => s.inCV && s.demonstrated)
  if (demonstratedInCV.length) {
    strengths.push(
      `${demonstratedInCV.length} ${demonstratedInCV.length === 1 ? 'competência demonstrada' : 'competências demonstradas'} por projetos ou certificados`,
    )
  }
  if (specificObjective) strengths.push('Objetivo profissional específico')
  if (hasEnglish) strengths.push('Nível de inglês informado')

  const u = state.user
  const checks: ResumeCheck[] = [
    { label: 'Contato completo', w: 10, ok: !!(u.email && u.phone && u.city) },
    { label: 'Link de portfólio', w: 5, ok: !!u.link },
    { label: 'Objetivo específico', w: 15, ok: specificObjective },
    { label: 'Formação', w: 10, ok: u.education.length > 0 },
    { label: 'Experiências', w: 10, ok: u.experiences.length > 0 },
    { label: 'Projetos (2 ou mais)', w: 20, ok: cvProjects.length >= 2, partial: cvProjects.length === 1 },
    { label: 'Competências (5 ou mais)', w: 10, ok: cvSkills.length >= 5 },
    { label: 'Idiomas com inglês', w: 10, ok: hasEnglish },
    { label: 'Cursos ou certificados', w: 10, ok: certsInCV.length > 0 || completedCourses.length > 0 },
  ]
  const completeness = checks.reduce((sum, c) => sum + (c.ok ? c.w : c.partial ? c.w / 2 : 0), 0)

  return {
    courseStats,
    certificates,
    inProgress,
    completedCourses,
    projectsDone,
    skills,
    goal,
    gaps,
    strengths,
    checks,
    completeness,
    cvProjects,
    unregisteredCourseSkills,
    lessonsDone: Object.keys(state.completed).length,
  }
}

/** Sugestão de objetivo profissional a partir do objetivo de carreira escolhido. */
export function suggestedObjective(state: UserState, catalog: Catalog) {
  const goal = findGoal(catalog, state.goals.primary)
  const byGoal: Record<string, string> = {
    marketing:
      'Estágio em marketing, com foco em pesquisa de público e posicionamento de marca para pequenos negócios.',
    estagio: 'Primeiro estágio em administração, com foco em atendimento, vendas e organização de processos.',
    programacao: 'Estágio em desenvolvimento de software, começando por projetos web em JavaScript.',
    vendas: 'Estágio em vendas consultivas, com foco em atendimento e relacionamento com clientes.',
    processo: 'Programa de estágio ou trainee em administração, com interesse em marketing e vendas.',
    ingles: 'Estágio em empresa com atuação internacional, usando inglês no dia a dia.',
    familia: 'Atuar na gestão da empresa da família, com foco em fluxo de caixa, atendimento e vendas.',
    criativo: 'Estágio em design ou arquitetura, desenvolvendo projetos visuais e de espaço.',
  }
  return (
    (goal && byGoal[goal.id]) ||
    'Estágio em administração, com foco em atendimento e vendas para pequenos negócios.'
  )
}
