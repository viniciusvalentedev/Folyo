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

/** "Como funciona, em 3 passos". */
export const JOURNEY_STEPS = [
  {
    k: 'Assista às aulas',
    text: 'Vídeos curtos e diretos, no celular ou no computador. Você marca cada aula concluída.',
  },
  {
    k: 'Faça um projeto real',
    text: 'Coloque em prática o que aprendeu e envie o seu trabalho em PDF ou link.',
  },
  {
    k: 'Ganhe certificado e currículo',
    text: 'O certificado sai em seu nome e entra, com o projeto, no currículo que a Folyo monta para você.',
  },
] as const

/** "Para quem é." */
export const AUDIENCE = [
  { id: 'ensino-medio', title: 'Estou no ensino médio', icon: 'BookOpen' },
  { id: 'terminei-escola', title: 'Terminei a escola', icon: 'Flag' },
  { id: 'faculdade', title: 'Estou na faculdade', icon: 'GraduationCap' },
  { id: 'formado', title: 'Já me formei na faculdade', icon: 'Briefcase' },
] as const

/** O que o curso gratuito ensina (cartão escuro da faixa azul). */
export const FREE_COURSE_LEARN = [
  'Entender como funcionam os processos seletivos',
  'Organizar a sua preparação',
  'Apresentar suas habilidades com mais estratégia e confiança',
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
    'Uma plataforma de cursos online curtos e práticos. Cada curso tem aulas em vídeo e, na maioria deles, um projeto para você colocar em prática. No final, você recebe um certificado em seu nome.',
  ],
  [
    'Preciso pagar para começar?',
    'Não. Criar a conta é grátis e o curso Descomplicando Processos Seletivos é gratuito. Os cursos pagos mostram o preço antes da compra.',
  ],
  [
    'Como são as aulas?',
    'São vídeos curtos, organizados em módulos. Você assiste pelo navegador, no celular ou no computador, e marca cada aula como concluída. A Folyo guarda de onde você parou.',
  ],
  [
    'O que é o projeto do curso?',
    'É um trabalho prático para aplicar o que você aprendeu. Você envia em PDF ou link e ele fica guardado no seu portfólio da Folyo.',
  ],
  [
    'Como recebo o certificado?',
    'Quando você conclui as aulas e envia o projeto (nos cursos que têm projeto), o certificado é emitido em seu nome e pode entrar no seu currículo da Folyo.',
  ],
  [
    'Preciso ter experiência?',
    'Não necessariamente. Cada curso informa o nível na página dele, como Iniciante, para você escolher o que faz sentido agora.',
  ],
] as const
