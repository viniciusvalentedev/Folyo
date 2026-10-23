import type { AdminCategory, AdminCourse, CourseErrors } from '@/lib/admin/catalog'
import type { MediaItem } from '@/lib/media'

/** O que cada aba do editor recebe. */
export type TabProps = {
  draft: AdminCourse
  set: (patch: Partial<AdminCourse>) => void
  errors: CourseErrors
}

export type EditorContext = {
  categories: AdminCategory[]
  /** Outros cursos (para pré-requisitos, relacionados e conferir título repetido). */
  others: { id: string; title: string }[]
  tags: string[]
  skills: string[]
  /** Biblioteca de mídia (imagens e PDFs) para escolher capas e materiais. */
  media: MediaItem[]
  /** Regra das Configurações: exigir capa para publicar. */
  requireCover: boolean
  /** O Bunny Stream está configurado no servidor? (só um sim/não) */
  bunny: boolean
}

/** Abas do editor. Fica aqui (e não no editor) porque a página, que roda no servidor, também precisa da lista. */
export type EditorTab = 'informacoes' | 'visual' | 'conteudo' | 'publicacao' | 'previa'
export const EDITOR_TABS: readonly EditorTab[] = ['informacoes', 'visual', 'conteudo', 'publicacao', 'previa']
