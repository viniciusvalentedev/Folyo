import type { Level, Tone } from '@/lib/types'
import type { LandingIconName } from './icons'

/**
 * Dados fixos da página pública (landing), copiados do protótipo da Folyo (artefato).
 * Os textos ficam aqui para a página ser idêntica à do protótipo.
 */

/** Link do Instagram da Folyo (rodapé). */
export const INSTAGRAM_URL = 'https://www.instagram.com/use.folyo/'

/**
 * Para onde levam os botões da landing. O protótipo tinha /criar-conta e /curso-gratis;
 * aqui as duas abrem a tela de entrada já na aba "Criar conta".
 */
export const HREF = {
  entrar: '/entrar',
  criarConta: '/entrar?modo=criar',
  cursoGratis: '/entrar?modo=criar',
  termos: '/termos',
  privacidade: '/privacidade',
} as const

/** Seções do menu do topo (e da coluna "Navegação" do rodapé): [id da seção, nome]. */
export const NAV_SECTIONS = [
  ['topo', 'Início'],
  ['areas', 'Explorar cursos'],
  ['como-funciona', 'Como funciona'],
  ['sobre', 'Sobre a Folyo'],
] as const

/* ---------------------------------------------------------------------------------------------
 * Catálogo mostrado na landing.
 *
 * Quem vê a landing não está logado, e o banco só entrega o catálogo para quem está (RLS de
 * categories/courses/lessons: `to authenticated`). Por isso a landing usa este retrato fixo do
 * catálogo publicado (conferido no banco em 12/11/2026). Publicou, despublicou ou renomeou um
 * curso ou uma área? Atualize aqui: os números da faixa, as áreas, o painel de cada área e as
 * telas de exemplo saem destas listas.
 * ------------------------------------------------------------------------------------------- */

export type LandingCourse = {
  id: string
  title: string
  /** Id da área (categoria). */
  cat: string
  level: Level
  hours: number
  free: boolean
  summary: string
  tone: Tone
  glyph: string
  /** Título do projeto do curso ('' = curso sem projeto). */
  project: string
  certificate: boolean
  /** Aulas publicadas, na ordem do curso: [título, minutos]. */
  lessons: readonly (readonly [string, number])[]
}

/** Áreas do conhecimento (categorias ativas), na ordem do catálogo: [id, nome, ícone]. */
export const AREAS = [
  ['marketing', 'Marketing e Comunicação', 'Megaphone'],
  ['vendas', 'Vendas e Negociação', 'Handshake'],
  ['tech', 'Programação e Tecnologia', 'Code'],
  ['arquitetura', 'Arquitetura e Design', 'Building2'],
  ['idiomas', 'Inglês e Idiomas', 'Languages'],
  ['negocios', 'Negócios e Empreendedorismo', 'Rocket'],
  ['gestao', 'Administração e Gestão', 'ClipboardList'],
  ['financas', 'Finanças', 'Wallet'],
  ['rh', 'Recursos Humanos', 'Users'],
  ['educacao', 'Educação e Pedagogia', 'GraduationCap'],
  ['atendimento', 'Atendimento e Experiência do Cliente', 'Headphones'],
  ['dados', 'Dados e Inteligência Artificial', 'BrainCircuit'],
  ['audiovisual', 'Design e Audiovisual', 'Clapperboard'],
  ['carreira', 'Carreira e Processos Seletivos', 'Briefcase'],
] as const satisfies readonly (readonly [string, string, LandingIconName])[]

/** Cursos publicados, na ordem do catálogo. O primeiro é o curso gratuito. */
export const COURSES: readonly LandingCourse[] = [
  {
    id: 'descomplicando-processos-seletivos',
    title: 'Descomplicando Processos Seletivos',
    cat: 'carreira',
    level: 'Iniciante',
    hours: 1,
    free: true,
    summary:
      'Desenvolva respostas mais convincentes, reconheça o que as empresas valorizam e transforme suas experiências em argumentos para conquistar oportunidades, mesmo sem experiência profissional formal.',
    tone: 'ink',
    glyph: 'fyo',
    project: '',
    certificate: false,
    lessons: [
      ['O currículo que faz o recrutador querer conhecer você.', 5],
      ['O que a empresa realmente quer saber sobre você.', 6],
      ['A entrevista sem medo: como construir respostas que convencem', 5],
      ['Vendendo seu peixe: como mostrar valor sem parecer que está se vendendo demais.', 5],
      ['Do preparo à aprovação: como executar um processo seletivo do início ao fim.', 6],
    ],
  },
  {
    id: 'marketing-na-pratica-da-estrategia',
    title: 'Marketing na prática: da estratégia à campanha',
    cat: 'marketing',
    level: 'Iniciante',
    hours: 1,
    free: false,
    summary:
      'Aprenda a analisar marcas, entender públicos, desenvolver estratégias de comunicação e planejar campanhas de marketing. Ao longo do curso, você construirá um projeto prático e organizará tudo em um PDF para apresentar.',
    tone: 'blue',
    glyph: '',
    project: 'Desenvolvimento de uma Estratégia de Marketing',
    certificate: true,
    lessons: [
      ['Antes de divulgar: entendendo a marca e o problema de marketing.', 6],
      ['Público e atenção: entendendo o que faz as pessoas se interessarem.', 6],
      ['Posicionamento e conteúdo: transformando estratégia em comunicação.', 6],
      ['Tráfego pago ou orgânico? Como escolher onde investir.', 6],
      ['Da estratégia à campanha: medindo e melhorando resultados.', 6],
      ['Do projeto ao portfólio: apresentando seu trabalho.', 2],
    ],
  },
]

/** O curso gratuito em destaque. */
export const FREE_COURSE = COURSES.find((c) => c.free) ?? COURSES[0]

/* ---------------------------------------------------------------------------------------------
 * Telas de exemplo (interface da Folyo em miniatura dentro dos aparelhos)
 * ------------------------------------------------------------------------------------------- */

/** Menu lateral da miniatura do Início: [ícone, nome]. */
export const UI_NAV = [
  ['House', 'Início'],
  ['Target', 'Objetivos'],
  ['Compass', 'Explorar cursos'],
  ['ChartColumn', 'Meu progresso'],
  ['FolderKanban', 'Projetos e portfólio'],
  ['FileText', 'Currículo'],
  ['Award', 'Certificados'],
] as const satisfies readonly (readonly [LandingIconName, string])[]

/** Dias da semana da miniatura do Início. */
export const UI_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const

/* ---------------------------------------------------------------------------------------------
 * Seção "Seu desenvolvimento em cada detalhe" (painel de exemplo)
 * ------------------------------------------------------------------------------------------- */

/** Cores por skill: `edge` (borda da bolha), `core` (centro) e `ink` (cor do texto sobre ela). */
export const SKILL_TONES: Record<string, { edge: string; core: string; ink: string }> = {
  Vendas: { edge: '#C9E23F', core: '#93AC14', ink: '#0B0B12' },
  Marketing: { edge: '#DD33CF', core: '#8E1F95', ink: '#FFFFFF' },
  Comunicação: { edge: '#5047E6', core: '#2D24C8', ink: '#FFFFFF' },
  Tecnologia: { edge: '#ABA6FF', core: '#6A61E2', ink: '#0B0B12' },
  Gestão: { edge: '#F07FE6', core: '#C23DB5', ink: '#0B0B12' },
  Design: { edge: '#E2F07E', core: '#B5CC2E', ink: '#0B0B12' },
  Idiomas: { edge: '#E9E8FC', core: '#ABA6FF', ink: '#0B0B12' },
  Carreira: { edge: '#9B3BB0', core: '#5A1470', ink: '#FFFFFF' },
}

/** Bolhas do gráfico de skills: raio, posição (%) e o valor que aparece dentro. */
export const SKILL_BUBBLES = [
  { k: 'Marketing', r: 74, x: 38, y: 50, v: '38%' },
  { k: 'Comunicação', r: 58, x: 58.5, y: 36, v: '24%' },
  { k: 'Tecnologia', r: 50, x: 60, y: 69, v: '17%' },
  { k: 'Design', r: 42, x: 75, y: 53, v: '12%' },
  { k: 'Vendas', r: 34, x: 23, y: 30, v: '9%' },
] as const

/** Horas de estudo por dia (cartão "Tempo de estudo"). Quinta é o dia atual do exemplo. */
export const STUDY_DAYS = [
  ['seg', 1.2],
  ['ter', 0.5],
  ['qua', 0.9],
  ['qui', 1.6],
  ['sex', 0.3],
  ['sáb', 0],
  ['dom', 0],
] as const

/** Aulas concluídas por semana (cartão "Aulas concluídas"). */
export const LESSONS_PER_WEEK = [1, 2, 2, 4, 3, 5, 6] as const

/** O que o painel "Meu progresso" mostra (selos abaixo do painel). */
export const PROGRESS_FEATURES = [
  'Horas de estudo',
  'Calendário de atividade',
  'Aulas e cursos concluídos',
  'Projetos enviados',
  'Certificados',
  'Metas pessoais',
  'Gráfico de skills',
] as const

/* ---------------------------------------------------------------------------------------------
 * Seção "Sobre a Folyo"
 * ------------------------------------------------------------------------------------------- */

/** Motivos para aprender (etiquetas inclinadas). */
export const WANTS = [
  'Entender inteligência artificial',
  'Aprender a programar',
  'Desenvolver marketing',
  'Me qualificar para uma vaga',
  'Explorar uma área nova',
  'Criar meus próprios projetos',
  'Saber mais, por gosto',
] as const

/** Inclinação de cada etiqueta (graus), na mesma ordem de WANTS. */
export const WANT_TILTS = [-3, 2, -1.5, 3, -2.5, 1.5, -1] as const

/** Cartões "Exemplo de caminho": o que a pessoa aprende e o que pode criar. */
export const PATHS = [
  { tone: 'ink', area: 'Inteligência artificial', make: 'Um projeto com IA para resolver uma tarefa do seu dia a dia' },
  { tone: 'blue', area: 'Programação', make: 'Um pequeno programa feito do zero, por você' },
  { tone: 'holo', area: 'Marketing', make: 'Uma estratégia de marketing para uma marca real' },
  { tone: 'lime', area: 'Uma área nova', make: 'Sua própria coleção de projetos práticos' },
] as const

/* ---------------------------------------------------------------------------------------------
 * "Como a Folyo funciona?" e perguntas frequentes
 * ------------------------------------------------------------------------------------------- */

/** Os 4 passos: [ícone, título, texto]. */
export const HOW_STEPS = [
  ['Compass', 'Descubra', 'Explore diferentes áreas e encontre algo que você quer aprender.'],
  ['BookOpen', 'Aprenda', 'Acesse cursos estruturados e desenvolva novos conhecimentos.'],
  ['Hammer', 'Coloque em prática', 'Aplique o que aprendeu desenvolvendo projetos práticos.'],
  ['TrendingUp', 'Evolua', 'Acompanhe seu progresso, desenvolva suas skills e organize suas conquistas.'],
] as const satisfies readonly (readonly [LandingIconName, string, string])[]

/** Perguntas frequentes: [pergunta, resposta]. */
export const FAQ = [
  [
    'O que é a Folyo?',
    'Uma plataforma de cursos online que une aulas, projetos práticos e acompanhamento do seu progresso. A ideia é que você aprenda algo, coloque em prática e saia com algo que você mesmo criou.',
  ],
  ['Criar uma conta na Folyo é gratuito?', 'Sim. Criar a conta é grátis e não pedimos cartão para isso.'],
  [
    'Todos os cursos são gratuitos?',
    'Não. O curso Descomplicando Processos Seletivos é gratuito. Os outros cursos são pagos, e o preço aparece na página de cada curso depois que você entra.',
  ],
  [
    'Como funcionam os cursos?',
    'Aulas em vídeo organizadas em módulos. Você marca cada aula como concluída, acompanha quanto falta e, nos cursos que têm projeto, entrega um trabalho prático no final.',
  ],
  [
    'Posso assistir às aulas pelo celular?',
    'Sim. A Folyo funciona no navegador do computador, do tablet e do celular, sem instalar nada. Seu progresso fica salvo na sua conta.',
  ],
  [
    'Recebo certificados?',
    'Sim, nos cursos que oferecem certificado. Ele é liberado quando você conclui as aulas e, se o curso tiver projeto, envia o projeto.',
  ],
  [
    'Posso desenvolver projetos durante os cursos?',
    'Sim. Nos cursos com projeto, você entrega o trabalho em PDF ou link. Ele fica no seu portfólio da Folyo e pode entrar no seu currículo.',
  ],
  [
    'Como funciona o acompanhamento de progresso?',
    'Em Meu progresso você vê tempo de estudo, calendário de atividade, aulas, cursos, projetos, certificados e metas que você mesmo define. No Início, o gráfico de skills mostra em quais habilidades você mais estudou.',
  ],
  [
    'Preciso ter experiência para começar?',
    'Não. Cada curso mostra o nível na própria página, e há cursos para quem está começando do zero.',
  ],
  [
    'Para quem a Folyo é indicada?',
    'Para quem quer aprender algo novo: quem está buscando o primeiro emprego, estudantes, profissionais que querem entender uma área nova, empreendedores e quem simplesmente gosta de aprender.',
  ],
] as const
