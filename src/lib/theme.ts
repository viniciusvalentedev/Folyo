/**
 * Temas da plataforma.
 *
 * - padrao: o visual atual da Folyo (nenhum ajuste; é o que existia antes dos temas).
 * - claro:  todas as telas claras, inclusive menu lateral e topo.
 * - escuro: todas as telas escuras. Só a folha do currículo continua branca (é um documento).
 *
 * A escolha fica salva neste navegador (localStorage) e vira o atributo `data-theme` no <html>.
 * No "padrao" o atributo nem existe: assim o CSS antigo roda exatamente como sempre rodou.
 * As regras dos temas moram em src/styles/themes.css.
 */
export const THEMES = ['padrao', 'claro', 'escuro'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'padrao'
export const THEME_STORAGE_KEY = 'folyo-theme'

export const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: 'padrao', label: 'Padrão', hint: 'O visual atual da Folyo.' },
  { value: 'claro', label: 'Claro', hint: 'Todas as telas claras.' },
  { value: 'escuro', label: 'Escuro', hint: 'Todas as telas escuras.' },
]

/** Cor da barra do navegador no celular (meta theme-color) em cada tema. */
export const THEME_BROWSER_COLOR: Record<Theme, string> = {
  padrao: '#0B0B12',
  claro: '#ECEBF4',
  escuro: '#0B0B12',
}

/** Qualquer valor desconhecido (ou apagado) vale como o tema padrão. */
export function parseTheme(value: unknown): Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value) ? (value as Theme) : DEFAULT_THEME
}

/**
 * Script que roda ANTES da primeira pintura da área do aluno, para a tela já abrir no tema certo
 * (sem piscar o escuro antes de virar claro). Só liga o atributo para claro/escuro.
 * Precisa continuar em uma linha, sem dependências: ele é inserido direto no HTML.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='claro'||t==='escuro'){var d=document.documentElement;d.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='claro'?${JSON.stringify(THEME_BROWSER_COLOR.claro)}:${JSON.stringify(THEME_BROWSER_COLOR.escuro)})}}catch(e){}`
