/**
 * Papéis da equipe e o que cada um pode fazer no painel.
 *
 * ATENÇÃO: isto aqui só decide o que a TELA mostra (esconder um botão, um item do
 * menu). Quem protege de verdade é o banco: cada função admin_* confere o papel
 * de quem chamou (supabase/migrations/20261022000002_etapa4_painel_admin.sql).
 * Se as regras mudarem, mude nos DOIS lugares.
 */

export const ROLES = {
  aluno: { label: 'Aluno', rank: 0, desc: 'Usa a plataforma. Sem acesso ao painel.' },
  editor: { label: 'Editor de conteúdo', rank: 1, desc: 'Cria e edita cursos, aulas, categorias e mídia.' },
  admin: { label: 'Administrador', rank: 2, desc: 'Tudo do editor, mais usuários, relatórios e configurações.' },
  proprietario: { label: 'Proprietário', rank: 3, desc: 'Acesso total, inclusive conceder o papel de administrador.' },
} as const

export type Role = keyof typeof ROLES
export const ROLE_KEYS = Object.keys(ROLES) as Role[]

export const isRole = (value: unknown): value is Role => typeof value === 'string' && value in ROLES
export const rankOf = (role: Role) => ROLES[role].rank

/** Permissões do painel e o papel mínimo de cada uma (igual ao protótipo). */
export const PERMS = {
  painel: 1,
  conteudo: 1,
  usuarios: 2,
  relatorios: 2,
  configuracoes: 2,
  permissoes: 2,
} as const
export type Perm = keyof typeof PERMS

export const can = (role: Role, perm: Perm) => rankOf(role) >= PERMS[perm]

/** Tabela "o que cada papel pode fazer" (papel mínimo de cada ação). */
export const ROLE_MATRIX: [string, number][] = [
  ['Ver o painel e a visão geral', 1],
  ['Criar, editar, publicar e despublicar cursos, módulos e aulas', 1],
  ['Categorias, tags, destaques e ordem do catálogo', 1],
  ['Excluir cursos (só os que nenhum aluno começou)', 2],
  ['Biblioteca de mídia (em breve)', 1],
  ['Usuários: consultar, suspender e reativar', 2],
  ['Audiência e relatórios (em breve)', 2],
  ['Configurações da plataforma (em breve)', 2],
  ['Conceder papel de editor', 2],
  ['Conceder papel de administrador ou proprietário', 3],
]

/**
 * Papéis que `actor` pode dar para `target`.
 * Ninguém muda o próprio papel; administrador só mexe em quem está abaixo dele e
 * só concede papéis abaixo do dele; proprietário pode tudo (menos em si mesmo).
 */
export function assignableRoles(actor: { id: string; role: Role }, target: { id: string; role: Role }): Role[] {
  const a = rankOf(actor.role)
  if (actor.id === target.id || a < 2) return []
  if (actor.role === 'proprietario') return ROLE_KEYS
  if (rankOf(target.role) >= a) return []
  return ROLE_KEYS.filter((r) => rankOf(r) < a)
}

/** `actor` pode suspender/reativar `target`? */
export function canManage(actor: { id: string; role: Role }, target: { id: string; role: Role }) {
  const a = rankOf(actor.role)
  return actor.id !== target.id && a >= 2 && (actor.role === 'proprietario' || rankOf(target.role) < a)
}

/** Itens do menu do painel. "soon" = área que ainda vai ser feita. */
export const ADMIN_NAV = [
  { to: '/admin', label: 'Visão geral', icon: 'LayoutDashboard', perm: 'painel' },
  { to: '/admin/cursos', label: 'Cursos', icon: 'BookOpen', perm: 'conteudo' },
  { to: '/admin/categorias', label: 'Categorias', icon: 'Tags', perm: 'conteudo' },
  { to: '/admin/aulas', label: 'Módulos e aulas', icon: 'Layers', perm: 'conteudo' },
  { to: '/admin/usuarios', label: 'Alunos e usuários', icon: 'Users', perm: 'usuarios' },
  { to: '/admin/audiencia', label: 'Audiência', icon: 'Activity', perm: 'relatorios', soon: true },
  { to: '/admin/relatorios', label: 'Relatórios', icon: 'FileSpreadsheet', perm: 'relatorios', soon: true },
  { to: '/admin/midia', label: 'Biblioteca de mídia', icon: 'Images', perm: 'conteudo', soon: true },
  { to: '/admin/configuracoes', label: 'Configurações', icon: 'Settings', perm: 'configuracoes', soon: true },
  { to: '/admin/permissoes', label: 'Administração e permissões', icon: 'ShieldCheck', perm: 'permissoes' },
] as const satisfies readonly { to: string; label: string; icon: string; perm: Perm; soon?: boolean }[]

/** O que vai entrar em cada área "em breve" (aparece na própria página). */
export const SOON: Record<string, string> = {
  audiencia: 'Quem está assistindo agora e o histórico de visualizações (depende do player de vídeo).',
  relatorios: 'Relatórios com exportação para planilha.',
  midia: 'Enviar e organizar capas, imagens, vídeos e PDFs.',
  configuracoes: 'Configurações gerais da plataforma.',
}

/** Nomes das ações do histórico. */
export const AUDIT_LABELS: Record<string, { label: string; icon: string }> = {
  'permissao.alterada': { label: 'Papel alterado', icon: 'UserCog' },
  'usuario.suspenso': { label: 'Conta suspensa', icon: 'Ban' },
  'usuario.reativado': { label: 'Conta reativada', icon: 'UserCheck' },
  'usuario.cadastrado': { label: 'Novo usuário', icon: 'UserPlus' },
  'curso.criado': { label: 'Curso criado', icon: 'FilePlus2' },
  'curso.atualizado': { label: 'Curso atualizado', icon: 'SquarePen' },
  'curso.publicado': { label: 'Curso publicado', icon: 'Send' },
  'curso.agendado': { label: 'Publicação agendada', icon: 'Calendar' },
  'curso.rascunho': { label: 'Curso voltou a rascunho', icon: 'Undo2' },
  'curso.arquivado': { label: 'Curso despublicado', icon: 'EyeOff' },
  'curso.excluido': { label: 'Curso excluído', icon: 'Trash2' },
  'categoria.criada': { label: 'Categoria criada', icon: 'Tags' },
  'categoria.atualizada': { label: 'Categoria atualizada', icon: 'Tags' },
  'categoria.excluida': { label: 'Categoria excluída', icon: 'Trash2' },
  'categorias.reordenadas': { label: 'Categorias reordenadas', icon: 'ArrowUpDown' },
  'catalogo.reordenado': { label: 'Catálogo reordenado', icon: 'ArrowUpDown' },
  'catalogo.atualizado': { label: 'Catálogo atualizado', icon: 'Layers' },
}

/** "aluno → editor" vira "Aluno → Editor de conteúdo". */
export function roleChangeText(detail: string) {
  const [from, to] = detail.split(' → ')
  return isRole(from) && isRole(to) ? `${ROLES[from].label} → ${ROLES[to].label}` : detail
}
