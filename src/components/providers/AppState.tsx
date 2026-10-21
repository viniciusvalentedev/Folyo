'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deriveUserData } from '@/lib/domain/derive'
import { findCourse, sameText } from '@/lib/domain/catalog'
import { newId, todayISO } from '@/lib/format'
import {
  saveGoalsAction,
  saveNameAction,
  saveWeeklyGoalAction,
  type ActionResult,
} from '@/lib/actions/profile'
import type {
  Catalog,
  Derived,
  Project,
  ProfileListKey,
  ResumeSection,
  ResumeState,
  Settings,
  Skill,
  UserProfile,
  UserState,
} from '@/lib/types'

export type ToastKind = 'ok' | 'err' | 'info'
export type Toast = {
  id: string
  text: string
  kind: ToastKind
  title?: string
  actionLabel?: string
  onAction?: () => void
  ms?: number
}
type ToastOptions = Omit<Toast, 'id' | 'text' | 'kind'>

/**
 * Estado do aluno no navegador.
 *
 * Etapa 1: o perfil (nome, objetivos, meta semanal, primeiro acesso) é salvo no
 * banco por "server actions" (src/lib/actions/profile.ts), que conferem quem está
 * logado e validam tudo de novo no servidor. O resto (aulas, projetos,
 * competências, currículo) ainda fica só na memória desta aba e passa a ser salvo
 * na etapa 2 — os componentes continuam chamando as mesmas ações.
 */
function useActions(
  commit: <R>(fn: (s: UserState) => R) => R,
  catalog: Catalog,
  persist: (pending: Promise<ActionResult>) => void,
) {
  return useMemo(
    () => ({
      startCourse: (cid: string) =>
        commit((s) => {
          if (!s.started[cid]) s.started[cid] = todayISO()
        }),
      openLesson: (cid: string, lid: string) =>
        commit((s) => {
          if (!s.started[cid]) s.started[cid] = todayISO()
          s.lastLesson[cid] = lid
        }),
      toggleLesson: (lid: string) =>
        commit((s) => {
          if (s.completed[lid]) delete s.completed[lid]
          else s.completed[lid] = todayISO()
        }),
      toggleFavorite: (cid: string) =>
        commit((s) => {
          s.favorites = s.favorites.includes(cid) ? s.favorites.filter((f) => f !== cid) : [...s.favorites, cid]
        }),
      setNote: (lid: string, text: string) =>
        commit((s) => {
          s.notes[lid] = text
        }),
      /** Garante que o projeto do curso exista e devolve o id dele. */
      ensureCourseProject: (cid: string) =>
        commit((s) => {
          const existing = s.projects.find((p) => p.courseId === cid)
          if (existing) return existing.id
          const course = findCourse(catalog, cid)
          if (!course) return null
          const id = 'p-' + cid
          s.projects.unshift({
            id,
            courseId: cid,
            origin: 'curso',
            status: 'andamento',
            tone: course.tone === 'paper' ? 'blue' : course.tone,
            title: course.project.title,
            desc: course.project.brief,
            problem: '',
            skills: course.skills.slice(0, 3),
            tools: [],
            steps: course.project.steps.map((t, i) => ({ id: 's' + (i + 1), title: t, done: false, note: '' })),
            result: '',
            links: [],
            completedAt: null,
            startedAt: todayISO(),
          })
          if (!s.started[cid]) s.started[cid] = todayISO()
          return id
        }),
      saveProject: (p: Project) =>
        commit((s) => {
          const i = s.projects.findIndex((x) => x.id === p.id)
          if (i >= 0) s.projects[i] = p
          else s.projects.unshift(p)
        }),
      deleteProject: (id: string) =>
        commit((s) => {
          s.projects = s.projects.filter((p) => p.id !== id)
          s.resume.projects = s.resume.projects.filter((p) => p !== id)
        }),
      updateStep: (pid: string, sid: string, patch: Partial<Project['steps'][number]>) =>
        commit((s) => {
          const step = s.projects.find((p) => p.id === pid)?.steps.find((st) => st.id === sid)
          if (step) Object.assign(step, patch)
        }),
      setProjectField: (pid: string, patch: Partial<Project>) =>
        commit((s) => {
          const p = s.projects.find((x) => x.id === pid)
          if (p) Object.assign(p, patch)
        }),
      /** Conclui o projeto e registra as competências novas. Devolve os nomes registrados. */
      finishProject: (pid: string) =>
        commit((s) => {
          const added: string[] = []
          const p = s.projects.find((x) => x.id === pid)
          if (!p) return added
          p.status = 'concluido'
          p.completedAt = todayISO()
          for (const name of p.skills) {
            if (!s.skills.some((k) => sameText(k.name, name))) {
              added.push(name)
              s.skills.push({ id: newId('k'), name, type: 'tecnica', inCV: false, note: '', createdAt: todayISO() })
            }
          }
          return added
        }),
      toggleProjectCV: (pid: string, on?: boolean) =>
        commit((s) => {
          const has = s.resume.projects.includes(pid)
          const want = on === undefined ? !has : on
          s.resume.projects = want ? [...new Set([...s.resume.projects, pid])] : s.resume.projects.filter((x) => x !== pid)
          if (want && !s.resume.order.includes('projetos')) s.resume.order.push('projetos')
          s.resume.hidden = s.resume.hidden.filter((x) => !(want && x === 'projetos'))
          s.resume.dirty = true
        }),
      toggleCertCV: (cid: string, on?: boolean) =>
        commit((s) => {
          const has = s.resume.certs.includes(cid)
          const want = on === undefined ? !has : on
          s.resume.certs = want ? [...new Set([...s.resume.certs, cid])] : s.resume.certs.filter((x) => x !== cid)
          s.resume.dirty = true
        }),
      addSkill: (skill: Pick<Skill, 'name' | 'type'> & Partial<Skill>) =>
        commit((s) => {
          s.skills.push({ id: newId('k'), inCV: true, note: '', createdAt: todayISO(), ...skill })
          s.resume.dirty = true
        }),
      registerSkills: (names: string[]) =>
        commit((s) => {
          for (const name of names) {
            if (!s.skills.some((k) => sameText(k.name, name))) {
              s.skills.push({ id: newId('k'), name, type: 'tecnica', inCV: true, note: '', createdAt: todayISO() })
            }
          }
          s.resume.dirty = true
        }),
      updateSkill: (id: string, patch: Partial<Skill>) =>
        commit((s) => {
          const k = s.skills.find((x) => x.id === id)
          if (k) Object.assign(k, patch)
          s.resume.dirty = true
        }),
      removeSkill: (id: string) =>
        commit((s) => {
          s.skills = s.skills.filter((k) => k.id !== id)
          s.resume.dirty = true
        }),
      setUser: (patch: Partial<UserProfile>) =>
        commit((s) => {
          Object.assign(s.user, patch)
          s.resume.dirty = true
        }),
      listAdd: <K extends ProfileListKey>(key: K, item: Omit<UserProfile[K][number], 'id'>) =>
        commit((s) => {
          ;(s.user[key] as unknown[]).push({ id: newId(key[0]), ...item })
          s.resume.dirty = true
        }),
      listUpdate: <K extends ProfileListKey>(key: K, id: string, patch: Partial<UserProfile[K][number]>) =>
        commit((s) => {
          const item = (s.user[key] as { id: string }[]).find((x) => x.id === id)
          if (item) Object.assign(item, patch)
          s.resume.dirty = true
        }),
      listRemove: (key: ProfileListKey, id: string) =>
        commit((s) => {
          ;(s.user[key] as { id: string }[]) = (s.user[key] as { id: string }[]).filter((x) => x.id !== id)
          s.resume.dirty = true
        }),
      setResume: (patch: Partial<ResumeState>) =>
        commit((s) => {
          Object.assign(s.resume, patch)
          s.resume.dirty = true
        }),
      moveSection: (sec: ResumeSection, dir: -1 | 1) =>
        commit((s) => {
          const order = s.resume.order
          const i = order.indexOf(sec)
          const j = i + dir
          if (i < 0 || j < 0 || j >= order.length) return
          ;[order[i], order[j]] = [order[j], order[i]]
          s.resume.dirty = true
        }),
      toggleSection: (sec: ResumeSection) =>
        commit((s) => {
          s.resume.hidden = s.resume.hidden.includes(sec)
            ? s.resume.hidden.filter((x) => x !== sec)
            : [...s.resume.hidden, sec]
          s.resume.dirty = true
        }),
      saveResume: () =>
        commit((s) => {
          s.resume.dirty = false
          s.resume.savedAt = new Date().toISOString()
        }),
      setGoal: (id: string) => {
        const goals = commit((s) => {
          if (s.goals.primary === id) return null
          s.goals.secondary = [s.goals.primary, ...s.goals.secondary.filter((g) => g !== id)]
            .filter((g): g is string => !!g)
            .slice(0, 2)
          s.goals.primary = id
          return { primary: id, secondary: s.goals.secondary }
        })
        if (goals) persist(saveGoalsAction(goals))
      },
      toggleSecondaryGoal: (id: string) => {
        const goals = commit((s) => {
          if (id === s.goals.primary || !s.goals.primary) return null
          s.goals.secondary = s.goals.secondary.includes(id)
            ? s.goals.secondary.filter((g) => g !== id)
            : [...s.goals.secondary, id].slice(-2)
          return { primary: s.goals.primary, secondary: s.goals.secondary }
        })
        if (goals) persist(saveGoalsAction(goals))
      },
      setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => {
        commit((s) => {
          s.settings[key] = value
        })
        if (key === 'weeklyGoal') persist(saveWeeklyGoalAction(value as number))
      },
      /** Troca o nome (salvo no banco). */
      saveName: (name: string) => {
        const clean = name.trim()
        commit((s) => {
          s.user.name = clean
          s.user.first = clean.split(' ')[0] || clean
        })
        persist(saveNameAction(clean))
      },
      markNotification: (id: string) =>
        commit((s) => {
          const n = s.notifications.find((x) => x.id === id)
          if (n) n.read = true
        }),
      markAllRead: () =>
        commit((s) => {
          s.notifications.forEach((n) => (n.read = true))
        }),
      pushNotification: (text: string, to: string) =>
        commit((s) => {
          s.notifications.unshift({ id: newId('n'), text, to, read: false, date: todayISO() })
        }),
      /** Atualiza a tela depois que o primeiro acesso foi salvo no banco. */
      completeOnboarding: ({ goal, stage, weekly }: { goal: string; stage: string; weekly: number }) =>
        commit((s) => {
          s.onboarded = true
          s.goals.primary = goal
          s.user.stage = stage
          s.user.headline = stage
          s.settings.weeklyGoal = weekly
        }),
    }),
    [commit, catalog, persist],
  )
}

export type Actions = ReturnType<typeof useActions>

type AppContextValue = {
  catalog: Catalog
  s: UserState
  d: Derived
  a: Actions
  toast: (text: string, kind?: ToastKind, opts?: ToastOptions) => void
  toasts: Toast[]
  dismissToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppStateProvider({
  catalog,
  initialState,
  children,
}: {
  catalog: Catalog
  initialState: UserState
  children: ReactNode
}) {
  const [state, setState] = useState(initialState)
  const stateRef = useRef(initialState)
  const [toasts, setToasts] = useState<Toast[]>([])

  const commit = useCallback(<R,>(fn: (s: UserState) => R): R => {
    const draft = structuredClone(stateRef.current)
    const result = fn(draft)
    stateRef.current = draft
    setState(draft)
    return result
  }, [])

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback(
    (text: string, kind: ToastKind = 'ok', opts: ToastOptions = {}) => {
      const id = newId('t')
      setToasts((t) => [...t.slice(-2), { id, text, kind, ...opts }])
      setTimeout(() => dismissToast(id), opts.ms || 4200)
    },
    [dismissToast],
  )

  /** Espera o servidor salvar; se der errado, avisa o aluno. */
  const persist = useCallback(
    (pending: Promise<ActionResult>) => {
      pending
        .then((r) => {
          if (!r.ok) toast(r.error, 'err')
        })
        .catch(() => toast('Sem conexão com o servidor. A alteração pode não ter sido salva.', 'err'))
    },
    [toast],
  )

  const a = useActions(commit, catalog, persist)
  const d = useMemo(() => deriveUserData(state, catalog), [state, catalog])

  useEffect(() => {
    document.documentElement.classList.toggle('calm', !!state.settings.reduceMotion)
  }, [state.settings.reduceMotion])

  const value = useMemo(
    () => ({ catalog, s: state, d, a, toast, toasts, dismissToast }),
    [catalog, state, d, a, toast, toasts, dismissToast],
  )
  return <AppContext value={value}>{children}</AppContext>
}

/** Acesso ao estado do aluno, aos dados calculados, às ações e aos avisos (toasts). */
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppStateProvider>')
  return ctx
}
