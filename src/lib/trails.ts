import type { IconName } from '@/components/ui/Icon'

/**
 * Trilhas de carreira e opções do primeiro acesso.
 *
 * As TRILHAS são cadastradas no painel (Trilhas) e ficam no banco; as daqui (DEFAULT_TRAILS) são as
 * de sempre: servem de ponto de partida e de reserva enquanto o SQL das trilhas não foi rodado.
 * O resto (momento de vida, áreas e objetivos do primeiro acesso) fica no código, igual para todo mundo.
 * O servidor usa estas listas para conferir o que chega: um id que não existe é recusado.
 */

export type Trail = {
  id: string
  icon: IconName
  title: string
  blurb: string
  /** Skills que a trilha desenvolve (comparadas com as skills dos cursos, sem acento e sem maiúsculas). */
  skills: string[]
  /** Palavras que indicam a área no texto do objetivo profissional do currículo. */
  keywords: string[]
  /** Cursos escolhidos à mão no painel, na ordem em que aparecem. Vazio = a trilha usa as skills. */
  courseIds: string[]
  /** Trilha desativada some da escolha, mas continua valendo para quem já a escolheu. */
  active: boolean
}

/** Formato do endereço (id) de uma trilha; é o mesmo do banco. */
export const TRAIL_ID_PATTERN = /^[a-z0-9-]{1,40}$/

/** As 7 trilhas de sempre (o mesmo que o SQL das trilhas cadastra de início). */
export const DEFAULT_TRAILS: Trail[] = [
  {
    id: 'marketing',
    icon: 'Megaphone',
    title: 'Construir carreira em Marketing',
    blurb: 'Entender públicos, posicionar marcas e comunicar ideias com clareza.',
    skills: ['Marketing', 'Comunicação'],
    keywords: ['marketing', 'marca', 'posicionamento', 'comunicação'],
    courseIds: [],
    active: true,
  },
  {
    id: 'vendas',
    icon: 'Handshake',
    title: 'Desenvolver carreira em Vendas',
    blurb: 'Vender com escuta e método, atender bem e gerar indicações.',
    skills: ['Vendas', 'Comunicação'],
    keywords: ['vendas', 'comercial', 'negociação'],
    courseIds: [],
    active: true,
  },
  {
    id: 'familia',
    icon: 'Rocket',
    title: 'Empreender e construir um negócio',
    blurb: 'Organizar o caixa, vender, atender e posicionar o próprio negócio.',
    skills: ['Gestão', 'Vendas', 'Marketing'],
    keywords: ['empresa', 'negócio', 'gestão', 'empreender'],
    courseIds: [],
    active: true,
  },
  {
    id: 'programacao',
    icon: 'Code',
    title: 'Construir carreira em Tecnologia',
    blurb: 'Sair do zero em programação e trabalhar com dados e IA com critério.',
    skills: ['Tecnologia', 'Idiomas'],
    keywords: ['programação', 'desenvolvimento', 'tecnologia', 'software'],
    courseIds: [],
    active: true,
  },
  {
    id: 'estagio',
    icon: 'Briefcase',
    title: 'Conseguir o primeiro estágio',
    blurb: 'Chegar preparado ao processo seletivo e mostrar o que você sabe fazer.',
    skills: ['Carreira', 'Comunicação', 'Idiomas'],
    keywords: ['estágio', 'estagio', 'processo seletivo', 'trainee'],
    courseIds: [],
    active: true,
  },
  {
    id: 'ingles',
    icon: 'Languages',
    title: 'Usar o inglês no trabalho',
    blurb: 'Participar de reuniões, escrever e-mails e responder entrevistas em inglês.',
    skills: ['Idiomas', 'Comunicação'],
    keywords: ['inglês', 'ingles'],
    courseIds: [],
    active: true,
  },
  {
    id: 'criativo',
    icon: 'Palette',
    title: 'Construir carreira em Arquitetura e Design',
    blurb: 'Ler e propor espaços e apresentar ideias visuais com processo.',
    skills: ['Design', 'Comunicação'],
    keywords: ['design', 'criativo', 'arquitetura'],
    courseIds: [],
    active: true,
  },
]

/** Acha uma trilha pelo id (ativa ou não: quem já escolheu uma trilha desativada continua com ela). */
export function findTrail(trails: readonly Trail[], id: string | null | undefined): Trail | null {
  return id ? (trails.find((t) => t.id === id) ?? null) : null
}

/** Só as trilhas que o aluno pode escolher agora. */
export const chooseableTrails = (trails: readonly Trail[]) => trails.filter((t) => t.active)

/** Skills sugeridas quando o catálogo ainda tem poucas (a escolha de skills em Objetivos). */
export const GENERIC_SKILLS = ['Marketing', 'Vendas', 'Comunicação', 'Tecnologia', 'Gestão', 'Design', 'Idiomas', 'Carreira']

// ---------- Primeiro acesso ----------

export type LifeStage = { id: string; title: string; desc: string; icon: IconName; headline: string }

export const LIFE_STAGES: LifeStage[] = [
  {
    id: 'ensino-medio',
    title: 'Estou no ensino médio',
    desc: 'Quero começar a me preparar para o futuro.',
    icon: 'BookOpen',
    headline: 'Estudante do ensino médio',
  },
  {
    id: 'terminei-escola',
    title: 'Terminei a escola',
    desc: 'Já me formei no ensino médio e não faço faculdade.',
    icon: 'Flag',
    headline: 'Ensino médio completo',
  },
  {
    id: 'faculdade',
    title: 'Estou na faculdade',
    desc: 'Quero desenvolver habilidades para minha carreira.',
    icon: 'GraduationCap',
    headline: 'Estudante universitário',
  },
  {
    id: 'formado',
    title: 'Já me formei na faculdade',
    desc: 'Quero avançar profissionalmente e explorar novas oportunidades.',
    icon: 'Briefcase',
    headline: 'Graduação concluída',
  },
]

export type OnboardingOption = {
  id: string
  label: string
  icon: IconName
  skills: string[]
  /** Trilha sugerida por esta escolha (null = nenhuma). */
  trail: string | null
  /** "Ainda estou descobrindo": não vira interesse, só marca que a pessoa está explorando. */
  open?: boolean
}

export const AREAS: OnboardingOption[] = [
  { id: 'marketing', label: 'Marketing', icon: 'Megaphone', skills: ['Marketing'], trail: 'marketing' },
  { id: 'vendas', label: 'Vendas', icon: 'Handshake', skills: ['Vendas'], trail: 'vendas' },
  { id: 'tecnologia', label: 'Tecnologia, programação e inteligência artificial', icon: 'Code', skills: ['Tecnologia'], trail: 'programacao' },
  { id: 'design', label: 'Design gráfico e comunicação visual', icon: 'Palette', skills: ['Design'], trail: 'criativo' },
  { id: 'arquitetura', label: 'Arquitetura', icon: 'Building2', skills: ['Design'], trail: 'criativo' },
  { id: 'comunicacao', label: 'Comunicação e oratória', icon: 'Mic', skills: ['Comunicação'], trail: null },
  { id: 'gestao', label: 'Gestão e administração', icon: 'ClipboardList', skills: ['Gestão'], trail: 'familia' },
  { id: 'empreendedorismo', label: 'Empreendedorismo e negócios', icon: 'Rocket', skills: ['Gestão', 'Vendas', 'Marketing'], trail: 'familia' },
  { id: 'dados', label: 'Dados e análise de negócios', icon: 'ChartColumn', skills: ['Tecnologia', 'Gestão'], trail: 'programacao' },
  { id: 'rh', label: 'Recursos humanos', icon: 'Users', skills: ['Comunicação', 'Carreira'], trail: null },
  { id: 'idiomas', label: 'Inglês e outros idiomas', icon: 'Languages', skills: ['Idiomas'], trail: 'ingles' },
  { id: 'descobrindo', label: 'Ainda estou descobrindo meus interesses', icon: 'Compass', skills: [], trail: null, open: true },
]

export const WANTS: OnboardingOption[] = [
  { id: 'estagio', label: 'Conseguir meu primeiro estágio', icon: 'Briefcase', skills: ['Carreira'], trail: 'estagio' },
  { id: 'emprego', label: 'Conquistar meu primeiro emprego', icon: 'BadgeCheck', skills: ['Carreira'], trail: 'estagio' },
  { id: 'curriculo', label: 'Melhorar meu currículo e portfólio', icon: 'FileText', skills: [], trail: null },
  { id: 'processos', label: 'Me preparar para processos seletivos', icon: 'ClipboardList', skills: ['Carreira', 'Comunicação'], trail: 'estagio' },
  { id: 'entrevistas', label: 'Aprender a me destacar em entrevistas', icon: 'MessageCircle', skills: ['Carreira', 'Comunicação'], trail: 'estagio' },
  { id: 'habilidades', label: 'Desenvolver habilidades profissionais', icon: 'Sparkles', skills: [], trail: null },
]

export const STAGE_IDS = LIFE_STAGES.map((s) => s.id)
export const AREA_IDS = AREAS.map((a) => a.id)
export const WANT_IDS = WANTS.map((w) => w.id)

export const findStage = (id: string | null | undefined) => LIFE_STAGES.find((s) => s.id === id) ?? null

/** Compara textos sem acento e sem maiúsculas (usado para skills). */
function same(a: string, b: string) {
  const n = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return n(a) === n(b)
}

/**
 * O que as respostas do primeiro acesso viram no perfil.
 *
 * Função pura usada nos DOIS lados: o servidor grava este resultado e a tela mostra o
 * mesmo resultado na hora. Como parte só de ids, quem manda o pedido não escolhe os textos.
 */
export function computeOnboarding(input: { stage: string; areas: string[]; wants: string[] }, trails: readonly Trail[]) {
  const stage = findStage(input.stage)
  if (!stage) return null
  const areas = AREAS.filter((a) => input.areas.includes(a.id))
  const wants = WANTS.filter((w) => input.wants.includes(w.id))

  const skills: string[] = []
  for (const option of [...areas, ...wants]) {
    for (const skill of option.skills) if (!skills.some((s) => same(s, skill))) skills.push(skill)
  }
  // A trilha sugerida tem que existir e estar ativa (o painel pode ter desativado ou excluído a de sempre).
  const offered = (id: string | null) => !!id && trails.some((t) => t.id === id && t.active)
  const primary = (areas.find((a) => offered(a.trail)) ?? wants.find((w) => offered(w.trail)))?.trail ?? null
  const trail = findTrail(trails, primary)

  return {
    stage: stage.id,
    headline: stage.headline,
    interests: areas.filter((a) => !a.open).map((a) => a.label),
    exploring: areas.some((a) => a.open),
    wants: wants.map((w) => w.id),
    skills,
    primary,
    text: wants.length ? wants[0].label : (trail?.title ?? ''),
  }
}

export type OnboardingResult = NonNullable<ReturnType<typeof computeOnboarding>>
