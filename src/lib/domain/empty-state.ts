import type { UserState } from '@/lib/types'

export type ProfileRow = {
  name: string
  stage: string | null
  goal_primary: string | null
  goals_secondary: string[]
  weekly_goal: number
  onboarded: boolean
  created_at: string
}

/**
 * Monta o estado de uma conta real a partir do perfil salvo no banco.
 *
 * Etapa 1: só o perfil (nome, objetivo, momento, meta semanal, primeiro acesso)
 * vem do banco. Aulas, projetos, competências e currículo começam vazios e
 * passam a ser salvos na etapa 2.
 */
export function stateFromProfile(profile: ProfileRow, email: string): UserState {
  const name = profile.name.trim() || email.split('@')[0]
  const joined = profile.created_at.slice(0, 10)
  return {
    onboarded: profile.onboarded,
    user: {
      name,
      first: name.split(' ')[0] || name,
      headline: profile.stage ?? '',
      stage: profile.stage ?? '',
      city: '',
      email,
      phone: '',
      link: '',
      bio: '',
      objective: '',
      interests: [],
      joined,
      education: [],
      experiences: [],
      languages: [{ id: 'g1', name: 'Português', level: 'Nativo' }],
      achievements: [],
    },
    completed: {},
    lastLesson: {},
    started: {},
    favorites: [],
    notes: {},
    projects: [],
    skills: [],
    resume: {
      template: 'classico',
      order: ['objetivo', 'formacao', 'experiencia', 'projetos', 'cursos', 'competencias', 'idiomas', 'conquistas'],
      hidden: [],
      projects: [],
      certs: [],
      savedAt: null,
      dirty: false,
    },
    goals: { primary: profile.goal_primary, secondary: profile.goals_secondary ?? [] },
    settings: {
      publicProfile: false,
      showEmail: false,
      publicPortfolio: false,
      notifyLessons: true,
      notifyWeekly: true,
      notifyNews: false,
      weeklyGoal: profile.weekly_goal,
      studyTime: 'noite',
      captions: true,
      autoplay: false,
      reduceMotion: false,
    },
    notifications: [
      {
        id: 'n-boas-vindas',
        text: 'Boas-vindas à Folyo. Comece pelo curso recomendado para o seu objetivo.',
        to: '/inicio',
        read: false,
        date: joined,
      },
    ],
  }
}
