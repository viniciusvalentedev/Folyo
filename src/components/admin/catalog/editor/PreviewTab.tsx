'use client'

import { useMemo } from 'react'
import { AppStateProvider, useApp } from '@/components/providers/AppState'
import { EmptyState } from '@/components/ui/indicators'
import { CourseView } from '@/app/(app)/(main)/cursos/[slug]/CourseView'
import type { AdminCategory, AdminCourse } from '@/lib/admin/catalog'
import { studentCatalog } from '@/lib/domain/catalog-rows'
import { previewState } from '@/lib/domain/preview-state'
import { Notice } from '../../ui'

/**
 * Prévia da página do curso como o aluno vai ver, com as alterações ainda não salvas.
 * Roda dentro de um estado de aluno "em branco" e com os cliques desligados (`inert`):
 * nada daqui é gravado.
 */
export function PreviewTab({ draft, categories }: { draft: AdminCourse; categories: AdminCategory[] }) {
  const { s } = useApp()
  const id = draft.id || 'previa'
  const catalog = useMemo(
    () => studentCatalog({ categories, courses: [{ ...draft, id, status: 'publicado', publishAt: null, hidden: false }], tags: [] }),
    [draft, id, categories],
  )
  const state = useMemo(() => previewState(catalog, s.settings.reduceMotion), [catalog, s.settings.reduceMotion])

  if (!catalog.courses.length) {
    return (
      <EmptyState icon="Eye" title="Nada para mostrar ainda">
        Adicione pelo menos uma aula publicada para ver a prévia da página do curso.
      </EmptyState>
    )
  }
  return (
    <div className="ad-preview">
      <Notice icon="Eye">Prévia da página do curso como o aluno vai ver, com as alterações ainda não salvas. Os botões ficam desativados aqui.</Notice>
      <div className="ad-preview-frame" inert>
        <AppStateProvider catalog={catalog} initialState={state}>
          <CourseView id={id} />
        </AppStateProvider>
      </div>
    </div>
  )
}
