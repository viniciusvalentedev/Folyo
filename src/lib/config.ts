/**
 * Configurações gerais do site.
 * No protótipo isso era editável pelo painel admin; por enquanto fica fixo aqui.
 */
export const siteConfig = {
  name: 'Folyo',
  tagline: 'Cursos práticos, projetos reais e um currículo que mostra o que você sabe fazer.',
  supportEmail: 'contato@usefolyo.com',
  catalog: {
    pageSize: 12,
    showPlanBadge: true,
    defaultSort: 'relevancia',
  },
} as const
