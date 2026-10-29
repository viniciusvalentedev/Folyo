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
} as const

/** Curso gratuito em destaque. */
export const FREE_COURSE_TITLE = 'Descomplicando Processos Seletivos'

/** Faixa de skills que corre na horizontal, no fim do hero. */
export const TICKER_SKILLS = [
  'Marketing',
  'Vendas',
  'Comunicação',
  'Tecnologia',
  'Gestão',
  'Design',
  'Idiomas',
  'Carreira',
] as const

/** Cores por skill: `edge` (cor da bolha/ponto) e `ink` (cor do texto sobre ela). */
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

/** Os 3 passos do hero: Aprenda. Crie. Mostre. */
export const JOURNEY_STEPS = [
  { k: 'Aprenda.', text: 'Aulas curtas, direto ao ponto.' },
  { k: 'Crie.', text: 'Um projeto real com o que aprendeu.' },
  { k: 'Mostre.', text: 'Algo concreto no seu portfólio.' },
] as const

/** Aulas do mini-cartão "Aprenda" (as duas primeiras aparecem concluídas). */
export const HERO_LESSONS = ['Fundamentos', 'Na prática', 'Projeto'] as const

/** Os 4 passos da história da Marina (exemplo ilustrativo). */
export const STORY_STEPS = [
  { k: 'Antes', t: 'Sabe, mas não tem como mostrar' },
  { k: 'Aprende', t: 'Faz um curso de marketing na Folyo' },
  { k: 'Cria', t: 'Desenvolve um projeto para a Aurora Café' },
  { k: 'Mostra', t: 'Leva o projeto pronto para o portfólio' },
] as const

/** Módulos do curso de marketing da Marina: [nome, concluído?]. */
export const STORY_MODULES = [
  ['Marca e público', true],
  ['Concorrência', true],
  ['Posicionamento', true],
  ['Campanhas', false],
] as const

/** Etapas do projeto da Marina (a última mostra as peças visuais). */
export const STORY_BLOCKS = [
  'Análise da marca',
  'Público prioritário',
  'Concorrentes',
  'Posicionamento',
  'Campanha',
  'Peças visuais',
] as const

/** Comparação em diagrama: só conhecimento x conhecimento aplicado. */
export const COMPARE_ROWS = [
  {
    k: 'Só conhecimento',
    cls: 'a',
    nodes: [
      ['BookOpen', 'Curso concluído'],
      ['Award', 'Certificado'],
      ['MessageCircle', 'Habilidade declarada'],
    ],
  },
  {
    k: 'Conhecimento aplicado',
    cls: 'b',
    nodes: [
      ['BookOpen', 'Curso concluído'],
      ['FolderKanban', 'Projeto desenvolvido'],
      ['BadgeCheck', 'Habilidade demonstrada'],
    ],
  },
] as const

/** "Para quem busca" (chips da seção de comparação). */
export const COMPARE_FOR = [
  ['Briefcase', 'Primeiro emprego'],
  ['GraduationCap', 'Estágio'],
  ['Compass', 'Sem experiência formal'],
  ['Award', 'Certificados, mas currículo fraco'],
  ['Lightbulb', 'Sabe fazer, mas não comprova'],
  ['FolderKanban', 'Quer um portfólio'],
] as const

/** Chips do curso gratuito (cartão azul). */
export const FREE_COURSE_CHIPS = [
  ['Sparkles', 'Gratuito'],
  ['Play', 'Aulas em vídeo'],
  ['Smartphone', 'Celular ou computador'],
] as const

/** O que o curso gratuito ensina (cartão escuro da faixa azul): [ícone, texto]. */
export const FREE_COURSE_LEARN = [
  ['Search', 'Entender os processos seletivos'],
  ['ListChecks', 'Organizar sua preparação'],
  ['MessageCircle', 'Apresentar suas habilidades com confiança'],
] as const

/** Bolhas do cartão "Suas skills ganham forma": [skill, left %, top %, raio %]. */
export const SKILL_BLOBS = [
  ['Comunicação', 40, 38, 40],
  ['Carreira', 72, 66, 30],
  ['Vendas', 26, 76, 22],
  ['Marketing', 82, 18, 14],
] as const

/** Perguntas frequentes. */
export const FAQ = [
  [
    'O que é a Folyo?',
    'Uma plataforma de cursos práticos: você aprende uma habilidade e cria um projeto que mostra o que sabe.',
  ],
  [
    'Como funcionam os cursos?',
    'Aulas em vídeo curtas, organizadas em módulos, e um projeto prático. Você estuda pelo celular ou computador.',
  ],
  ['O que são os projetos?', 'Trabalhos em que você aplica o que aprendeu. Você envia em PDF ou link.'],
  [
    'Como posso usar os projetos?',
    'Eles ficam no seu portfólio da Folyo, podem entrar no seu currículo e servem para mostrar em entrevistas.',
  ],
  [
    'Qual a diferença para outros cursos online?',
    'Você não só aprende a habilidade: aplica o que aprendeu e sai com um projeto que demonstra isso.',
  ],
  [
    'Os cursos oferecem certificado?',
    'Sim. Ao concluir as aulas e enviar o projeto (quando o curso tiver), o certificado sai em seu nome.',
  ],
  ['Existem cursos gratuitos?', 'Sim. Criar a conta é grátis e o curso Descomplicando Processos Seletivos é gratuito.'],
  [
    'Preciso ter experiência para começar?',
    'Não. Cada curso mostra o nível na página dele, e a Folyo foi pensada para quem está construindo a própria experiência.',
  ],
  [
    'Isso garante um estágio ou emprego?',
    'Nenhum curso garante uma vaga. O projeto ajuda você a mostrar, com clareza, o que sabe fazer.',
  ],
] as const
