import { stateFromRows } from '@/lib/domain/student-state'
import type { Catalog, UserState } from '@/lib/types'

/**
 * Estado de um aluno "em branco" (sem progresso nenhum) para a PRÉVIA do curso no painel.
 * Nada disso vai para o banco: é só para desenhar a página do curso como um aluno novo a veria.
 */
export function previewState(catalog: Catalog, reduceMotion: boolean): UserState {
  const now = new Date().toISOString()
  return stateFromRows(
    {
      profile: {
        name: 'Prévia',
        stage: null,
        exploring: false,
        goal_primary: null,
        goals_secondary: [],
        goals_text: '',
        goals_skills: [],
        goals_wants: [],
        onboarded: true,
        created_at: now,
        updated_at: now,
        headline: '',
        city: '',
        contact_email: '',
        phone: '',
        link: '',
        bio: '',
        objective: '',
        interests: [],
        education: [],
        experiences: [],
        languages: [],
        achievements: [],
        resume_template: 'classico',
        resume_order: [],
        resume_hidden: [],
        resume_certs: [],
        public_profile: false,
        public_portfolio: false,
        show_email: false,
        notify_lessons: false,
        notify_weekly: false,
        notify_news: false,
        study_time: '',
        captions: false,
        autoplay: false,
        reduce_motion: reduceMotion,
        notifications_read_at: null,
      },
      email: 'previa@folyo.app',
      role: 'aluno',
      progress: [],
      completions: [],
      notes: [],
      watch: [],
      works: [],
      skills: [],
    },
    catalog,
  )
}
