'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { saveGoalsAction } from '@/lib/actions/profile'
import type { ActionResult } from '@/lib/actions/shared'
import {
  deleteProjectAction,
  deleteSkillAction,
  markNotificationsReadAction,
  saveCourseProgressAction,
  saveLessonNoteAction,
  saveProfileAction,
  saveProjectAction,
  saveResumeAction,
  saveSettingsAction,
  saveSkillAction,
  setLessonDoneAction,
} from '@/lib/actions/student'
import { deriveUserData } from '@/lib/domain/derive'
import { findCourse, findLesson, sameText } from '@/lib/domain/catalog'
import { newId, newUuid, todayISO } from '@/lib/format'
import { LIST_MAX } from '@/lib/validation'
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

/** Espera a pessoa parar de digitar antes de salvar. */
const TYPING_DELAY = 800
const WELCOME_ID = 'n-boas-vindas'
const OK_RESULT: ActionResult = { ok: true }
const OFFLINE = 'Sem conexão com o servidor. Suas últimas alterações podem não ter sido salvas.'

const PROFILE_FIELDS = new Set([
  'name', 'headline', 'city', 'email', 'phone', 'link', 'bio', 'objective',
  'interests', 'education', 'experiences', 'languages', 'achievements',
])
const RESUME_FIELDS = new Set(['template', 'order', 'hidden', 'projects', 'certs'])

/** Só os campos que vão para o banco (o resto é calculado ou marcado pelo servidor). */
function toStoredProject(p: Project) {
  return {
    id: p.id,
    courseId: p.courseId,
    origin: p.origin,
    status: p.status,
    tone: p.tone,
    title: p.title,
    desc: p.desc,
    problem: p.problem,
    skills: p.skills,
    tools: p.tools,
    steps: p.steps,
    result: p.result,
    links: p.links,
  }
}

function toStoredProfile(u: UserProfile) {
  return {
    name: u.name,
    headline: u.headline,
    city: u.city,
    email: u.email,
    phone: u.phone,
    link: u.link,
    bio: u.bio,
    objective: u.objective,
    interests: u.interests,
    education: u.education,
    experiences: u.experiences,
    languages: u.languages,
    achievements: u.achievements,
  }
}

type Job = () => Promise<ActionResult>
type Sync = {
  schedule: (key: string, job: Job, delay?: number) => void
  flush: () => void
  /** Esta chave ainda tem algo esperando para ser gravado (ou sendo gravado)? */
  isPending: (key: string) => boolean
}

/**
 * Fila de gravação no servidor.
 *
 * A tela muda na hora (o aluno não espera) e, logo depois, o servidor grava.
 *  - Cada "chave" (ex.: "project:<id>") tem no máximo um pedido por vez, e sempre
 *    manda o estado mais recente. Assim os pedidos nunca chegam fora de ordem.
 *  - Sem internet: tenta de novo algumas vezes antes de avisar.
 *  - Se a pessoa tentar fechar a aba com algo ainda não salvo, o navegador pergunta antes.
 */
function useSync(onError: (message: string) => void, onIdle: (clean: boolean) => void): Sync & { version: number } {
  // Muda sempre que a fila muda: assim a tela pode mostrar "Salvando…" / "Salvo".
  const [version, bump] = useReducer((n: number) => n + 1, 0)
  const queued = useRef(new Map<string, Job>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inflight = useRef(new Set<string>())
  const retries = useRef(new Map<string, number>())
  const hadError = useRef(false)
  const callbacks = useRef({ onError, onIdle })
  useEffect(() => {
    callbacks.current = { onError, onIdle }
  })

  const sync = useMemo<Sync>(() => {
    const busy = () => queued.current.size > 0 || inflight.current.size > 0

    const run = (key: string) => {
      if (inflight.current.has(key)) return
      const job = queued.current.get(key)
      if (!job) return
      queued.current.delete(key)
      inflight.current.add(key)
      job()
        .then((result) => {
          retries.current.delete(key)
          if (!result.ok) {
            hadError.current = true
            callbacks.current.onError(result.error)
          }
        })
        .catch(() => {
          // Falha de rede: tenta de novo (até 3 vezes), sempre com o estado mais recente.
          // Se já existe um pedido mais novo na fila, ele leva o estado mais recente: não precisa avisar.
          if (queued.current.has(key)) return
          const n = (retries.current.get(key) ?? 0) + 1
          if (n <= 3) {
            retries.current.set(key, n)
            queued.current.set(key, job)
            timers.current.set(key, setTimeout(() => (timers.current.delete(key), run(key)), 1500 * n))
          } else {
            retries.current.delete(key)
            hadError.current = true
            callbacks.current.onError(OFFLINE)
          }
        })
        .finally(() => {
          inflight.current.delete(key)
          if (queued.current.has(key) && !timers.current.has(key)) run(key)
          bump()
          if (!busy()) {
            callbacks.current.onIdle(!hadError.current)
            hadError.current = false
          }
        })
    }

    return {
      schedule(key, job, delay = 0) {
        if (!queued.current.has(key) && !inflight.current.has(key)) bump()
        queued.current.set(key, job)
        retries.current.delete(key)
        clearTimeout(timers.current.get(key))
        timers.current.set(
          key,
          setTimeout(() => {
            timers.current.delete(key)
            run(key)
          }, delay),
        )
      },
      flush() {
        for (const [key, timer] of timers.current) {
          clearTimeout(timer)
          timers.current.delete(key)
          run(key)
        }
      },
      isPending(key) {
        return queued.current.has(key) || inflight.current.has(key)
      },
    }
  }, [])

  useEffect(() => {
    const busy = () => queued.current.size > 0 || inflight.current.size > 0
    const onHide = () => {
      if (document.visibilityState === 'hidden') sync.flush()
    }
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!busy()) return
      sync.flush()
      e.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onLeave)
    }
  }, [sync])

  return useMemo(() => ({ ...sync, version }), [sync, version])
}

/**
 * Estado do aluno no navegador.
 *
 * Etapa 2: tudo o que o aluno faz é salvo no banco por "server actions"
 * (src/lib/actions/student.ts e profile.ts). Elas conferem quem está logado e
 * validam tudo de novo no servidor; o banco ainda confere com RLS. Aqui só
 * atualizamos a tela na hora e colocamos o pedido de gravação na fila.
 */
function useActions(
  commit: <R>(fn: (s: UserState) => R) => R,
  stateRef: RefObject<UserState>,
  catalog: Catalog,
  sync: Sync,
  changed: RefObject<Map<string, Set<string>>>,
  notify: (text: string, kind?: ToastKind) => void,
) {
  return useMemo(() => {
    const now = () => stateRef.current

    // Perfil, currículo e configurações: só os CAMPOS que mudaram vão para o servidor.
    // Assim uma aba antiga aberta não desfaz o que foi mudado em outra aba ou no celular.
    const mark = (key: string, fields: Iterable<string>) => {
      const set = changed.current.get(key) ?? new Set<string>()
      for (const f of fields) set.add(f)
      changed.current.set(key, set)
    }
    const patchJob =
      <T extends object>(key: string, source: () => T, send: (patch: Partial<T>) => Promise<ActionResult>) =>
      () => {
        const fields = changed.current.get(key)
        changed.current.delete(key)
        if (!fields?.size) return Promise.resolve(OK_RESULT)
        const all = source() as Record<string, unknown>
        const patch: Record<string, unknown> = {}
        for (const f of fields) if (f in all) patch[f] = all[f]
        // Sem internet: os campos voltam para a lista e vão no próximo envio.
        return send(patch as Partial<T>).catch((e) => {
          mark(key, fields)
          throw e
        })
      }

    // Cada "chave" sincroniza o estado ATUAL de uma coisa (um curso, uma aula, um projeto...).
    // Se a pessoa clicar várias vezes, vai só o resultado final.
    const syncCourse = (cid: string) =>
      sync.schedule('course:' + cid, () => {
        const s = now()
        return saveCourseProgressAction({
          courseId: cid,
          started: !!s.started[cid],
          lastLessonId: s.lastLesson[cid] ?? null,
          favorite: s.favorites.includes(cid),
        })
      }, 300)
    const syncLesson = (lid: string) => {
      const found = findLesson(catalog, lid)
      if (!found) return
      sync.schedule('lesson:' + lid, () =>
        setLessonDoneAction({ courseId: found.course.id, lessonId: lid, done: !!now().completed[lid] }),
      )
    }
    const syncNote = (lid: string) => {
      const found = findLesson(catalog, lid)
      if (!found) return
      sync.schedule(
        'note:' + lid,
        () => saveLessonNoteAction({ courseId: found.course.id, lessonId: lid, body: now().notes[lid] ?? '' }),
        TYPING_DELAY,
      )
    }
    /** Projeto existe no estado → salva; não existe mais → apaga. */
    const syncProject = (pid: string, delay = 0) =>
      sync.schedule('project:' + pid, () => {
        const p = now().projects.find((x) => x.id === pid)
        return p ? saveProjectAction(toStoredProject(p)) : deleteProjectAction(pid)
      }, delay)
    const syncSkill = (id: string) =>
      sync.schedule('skill:' + id, () => {
        const k = now().skills.find((x) => x.id === id)
        return k ? saveSkillAction({ id: k.id, name: k.name, type: k.type, inCV: k.inCV, note: k.note }) : deleteSkillAction(id)
      })
    const syncProfile = (fields: Iterable<string>, delay = TYPING_DELAY) => {
      mark('profile', [...fields].filter((f) => PROFILE_FIELDS.has(f)))
      sync.schedule('profile', patchJob('profile', () => toStoredProfile(now().user), saveProfileAction), delay)
    }
    const syncResume = (fields: Iterable<string>) => {
      mark('resume', [...fields].filter((f) => RESUME_FIELDS.has(f)))
      sync.schedule('resume', patchJob('resume', () => now().resume, saveResumeAction), 300)
    }
    const syncSettings = (field: string) => {
      mark('settings', [field])
      sync.schedule('settings', patchJob('settings', () => now().settings, saveSettingsAction), 300)
    }
    const syncGoals = () =>
      sync.schedule('goals', () => {
        const g = now().goals
        return g.primary ? saveGoalsAction({ primary: g.primary, secondary: g.secondary }) : Promise.resolve(OK_RESULT)
      }, 300)

    return {
      startCourse: (cid: string) => {
        const changed = commit((s) => {
          if (s.started[cid]) return false
          s.started[cid] = todayISO()
          return true
        })
        if (changed) syncCourse(cid)
      },
      openLesson: (cid: string, lid: string) => {
        const changed = commit((s) => {
          const before = !!s.started[cid] && s.lastLesson[cid] === lid
          if (!s.started[cid]) s.started[cid] = todayISO()
          s.lastLesson[cid] = lid
          return !before
        })
        if (changed) syncCourse(cid)
      },
      toggleLesson: (lid: string) => {
        commit((s) => {
          if (s.completed[lid]) delete s.completed[lid]
          else s.completed[lid] = todayISO()
        })
        syncLesson(lid)
      },
      toggleFavorite: (cid: string) => {
        commit((s) => {
          s.favorites = s.favorites.includes(cid) ? s.favorites.filter((f) => f !== cid) : [...s.favorites, cid]
        })
        syncCourse(cid)
      },
      setNote: (lid: string, text: string) => {
        commit((s) => {
          if (text.trim()) s.notes[lid] = text
          else delete s.notes[lid]
        })
        syncNote(lid)
      },
      /** Garante que o projeto do curso exista e devolve o id dele. */
      ensureCourseProject: (cid: string) => {
        const result = commit((s) => {
          const existing = s.projects.find((p) => p.courseId === cid)
          if (existing) return { id: existing.id, created: false }
          const course = findCourse(catalog, cid)
          if (!course) return null
          const id = newUuid()
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
          return { id, created: true }
        })
        if (!result) return null
        if (result.created) {
          syncProject(result.id)
          syncCourse(cid)
        }
        return result.id
      },
      saveProject: (p: Project) => {
        commit((s) => {
          const i = s.projects.findIndex((x) => x.id === p.id)
          if (i >= 0) s.projects[i] = p
          else s.projects.unshift(p)
        })
        syncProject(p.id)
      },
      deleteProject: (id: string) => {
        const wasInCV = commit((s) => {
          const inCV = s.resume.projects.includes(id)
          s.projects = s.projects.filter((p) => p.id !== id)
          s.resume.projects = s.resume.projects.filter((p) => p !== id)
          return inCV
        })
        syncProject(id)
        if (wasInCV) syncResume(['projects'])
      },
      updateStep: (pid: string, sid: string, patch: Partial<Project['steps'][number]>) => {
        commit((s) => {
          const step = s.projects.find((p) => p.id === pid)?.steps.find((st) => st.id === sid)
          if (step) Object.assign(step, patch)
        })
        syncProject(pid, 'note' in patch ? TYPING_DELAY : 0)
      },
      setProjectField: (pid: string, patch: Partial<Project>) => {
        commit((s) => {
          const p = s.projects.find((x) => x.id === pid)
          if (p) Object.assign(p, patch)
        })
        syncProject(pid, TYPING_DELAY)
      },
      /** Conclui o projeto e registra as competências novas. Devolve os nomes registrados. */
      finishProject: (pid: string) => {
        const created: { id: string; name: string }[] = []
        const found = commit((s) => {
          const p = s.projects.find((x) => x.id === pid)
          if (!p) return false
          p.status = 'concluido'
          p.completedAt = todayISO()
          for (const name of p.skills) {
            if (!s.skills.some((k) => sameText(k.name, name))) {
              const id = newUuid()
              created.push({ id, name })
              s.skills.push({ id, name, type: 'tecnica', inCV: false, note: '', createdAt: todayISO() })
            }
          }
          return true
        })
        if (found) {
          syncProject(pid)
          created.forEach((k) => syncSkill(k.id))
        }
        return created.map((k) => k.name)
      },
      toggleProjectCV: (pid: string, on?: boolean) => {
        commit((s) => {
          const has = s.resume.projects.includes(pid)
          const want = on === undefined ? !has : on
          s.resume.projects = want ? [...new Set([...s.resume.projects, pid])] : s.resume.projects.filter((x) => x !== pid)
          if (want && !s.resume.order.includes('projetos')) s.resume.order.push('projetos')
          s.resume.hidden = s.resume.hidden.filter((x) => !(want && x === 'projetos'))
          s.resume.dirty = true
        })
        syncResume(['projects', 'order', 'hidden'])
      },
      toggleCertCV: (cid: string, on?: boolean) => {
        commit((s) => {
          const has = s.resume.certs.includes(cid)
          const want = on === undefined ? !has : on
          s.resume.certs = want ? [...new Set([...s.resume.certs, cid])] : s.resume.certs.filter((x) => x !== cid)
          s.resume.dirty = true
        })
        syncResume(['certs'])
      },
      addSkill: (skill: Pick<Skill, 'name' | 'type'> & Partial<Skill>) => {
        const id = newUuid()
        commit((s) => {
          s.skills.push({ inCV: true, note: '', createdAt: todayISO(), ...skill, id })
          s.resume.dirty = true
        })
        syncSkill(id)
      },
      registerSkills: (names: string[]) => {
        const ids: string[] = []
        commit((s) => {
          for (const name of names) {
            if (!s.skills.some((k) => sameText(k.name, name))) {
              const id = newUuid()
              ids.push(id)
              s.skills.push({ id, name, type: 'tecnica', inCV: true, note: '', createdAt: todayISO() })
            }
          }
          s.resume.dirty = true
        })
        ids.forEach(syncSkill)
      },
      updateSkill: (id: string, patch: Partial<Skill>) => {
        commit((s) => {
          const k = s.skills.find((x) => x.id === id)
          if (k) Object.assign(k, { ...patch, id: k.id })
          s.resume.dirty = true
        })
        syncSkill(id)
      },
      removeSkill: (id: string) => {
        commit((s) => {
          s.skills = s.skills.filter((k) => k.id !== id)
          s.resume.dirty = true
        })
        syncSkill(id)
      },
      setUser: (patch: Partial<UserProfile>) => {
        commit((s) => {
          Object.assign(s.user, patch)
          if (patch.name !== undefined) s.user.first = patch.name.trim().split(' ')[0] || patch.name.trim()
          s.resume.dirty = true
        })
        syncProfile(Object.keys(patch))
      },
      listAdd: <K extends ProfileListKey>(key: K, item: Omit<UserProfile[K][number], 'id'>) => {
        if (now().user[key].length >= LIST_MAX[key]) {
          notify(`Você pode ter até ${LIST_MAX[key]} itens nesta lista.`, 'err')
          return
        }
        commit((s) => {
          ;(s.user[key] as unknown[]).push({ id: newId(key[0]), ...item })
          s.resume.dirty = true
        })
        syncProfile([key])
      },
      listUpdate: <K extends ProfileListKey>(key: K, id: string, patch: Partial<UserProfile[K][number]>) => {
        commit((s) => {
          const item = (s.user[key] as { id: string }[]).find((x) => x.id === id)
          if (item) Object.assign(item, patch, { id: item.id })
          s.resume.dirty = true
        })
        syncProfile([key])
      },
      listRemove: (key: ProfileListKey, id: string) => {
        commit((s) => {
          ;(s.user[key] as { id: string }[]) = (s.user[key] as { id: string }[]).filter((x) => x.id !== id)
          s.resume.dirty = true
        })
        syncProfile([key])
      },
      setResume: (patch: Partial<ResumeState>) => {
        commit((s) => {
          Object.assign(s.resume, patch)
          s.resume.dirty = true
        })
        syncResume(Object.keys(patch))
      },
      moveSection: (sec: ResumeSection, dir: -1 | 1) => {
        commit((s) => {
          const order = s.resume.order
          const i = order.indexOf(sec)
          const j = i + dir
          if (i < 0 || j < 0 || j >= order.length) return
          ;[order[i], order[j]] = [order[j], order[i]]
          s.resume.dirty = true
        })
        syncResume(['order'])
      },
      toggleSection: (sec: ResumeSection) => {
        commit((s) => {
          s.resume.hidden = s.resume.hidden.includes(sec)
            ? s.resume.hidden.filter((x) => x !== sec)
            : [...s.resume.hidden, sec]
          s.resume.dirty = true
        })
        syncResume(['hidden'])
      },
      /** O currículo é salvo sozinho; o botão "Salvar" só manda na hora o que ainda está esperando. */
      saveResume: () => sync.flush(),
      setGoal: (id: string) => {
        const changed = commit((s) => {
          if (s.goals.primary === id) return false
          s.goals.secondary = [s.goals.primary, ...s.goals.secondary.filter((g) => g !== id)]
            .filter((g): g is string => !!g)
            .slice(0, 2)
          s.goals.primary = id
          return true
        })
        if (changed) syncGoals()
      },
      toggleSecondaryGoal: (id: string) => {
        const changed = commit((s) => {
          if (id === s.goals.primary || !s.goals.primary) return false
          s.goals.secondary = s.goals.secondary.includes(id)
            ? s.goals.secondary.filter((g) => g !== id)
            : [...s.goals.secondary, id].slice(-2)
          return true
        })
        if (changed) syncGoals()
      },
      setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => {
        commit((s) => {
          s.settings[key] = value
        })
        syncSettings(key)
      },
      /** Troca o nome (salvo no banco). */
      saveName: (name: string) => {
        const clean = name.trim()
        commit((s) => {
          s.user.name = clean
          s.user.first = clean.split(' ')[0] || clean
        })
        syncProfile(['name'], 0)
      },
      markNotification: (id: string) => {
        const changed = commit((s) => {
          const n = s.notifications.find((x) => x.id === id)
          if (!n || n.read) return false
          n.read = true
          return id === WELCOME_ID
        })
        if (changed) sync.schedule('notifications', () => markNotificationsReadAction())
      },
      markAllRead: () => {
        const changed = commit((s) => {
          const welcomeUnread = s.notifications.some((n) => n.id === WELCOME_ID && !n.read)
          s.notifications.forEach((n) => (n.read = true))
          return welcomeUnread
        })
        if (changed) sync.schedule('notifications', () => markNotificationsReadAction())
      },
      /** Aviso só desta visita (não fica salvo). */
      pushNotification: (text: string, to: string) =>
        commit((s) => {
          s.notifications.unshift({ id: newId('n'), text, to, read: false, date: todayISO() })
        }),
      /** Atualiza a tela depois que o primeiro acesso foi salvo no banco (pela própria tela). */
      completeOnboarding: ({ goal, stage, weekly }: { goal: string; stage: string; weekly: number }) =>
        commit((s) => {
          s.onboarded = true
          s.goals.primary = goal
          s.user.stage = stage
          if (!s.user.headline) s.user.headline = stage
          s.settings.weeklyGoal = weekly
        }),
    }
  }, [commit, stateRef, catalog, sync, changed, notify])
}

export type Actions = ReturnType<typeof useActions>

type AppContextValue = {
  catalog: Catalog
  s: UserState
  d: Derived
  a: Actions
  /** "Salvando…" ou "Salvo" para uma chave da fila (ex.: "note:mkt-1"). */
  isSaving: (key: string) => boolean
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

  /** Um aviso de erro por vez (se vários pedidos falharem juntos, não enche a tela). */
  const lastError = useRef(0)
  const onSyncError = useCallback(
    (message: string) => {
      const t = Date.now()
      if (t - lastError.current < 4000) return
      lastError.current = t
      toast(message, 'err')
    },
    [toast],
  )
  /** Tudo gravado sem erro: o currículo deixa de mostrar "alterações não salvas". */
  const onSyncIdle = useCallback(
    (clean: boolean) => {
      if (!clean || !stateRef.current.resume.dirty) return
      commit((s) => {
        s.resume.dirty = false
        s.resume.savedAt = new Date().toISOString()
      })
    },
    [commit],
  )
  const sync = useSync(onSyncError, onSyncIdle)

  const { schedule, flush, isPending } = sync
  const queue = useMemo<Sync>(() => ({ schedule, flush, isPending }), [schedule, flush, isPending])
  const changed = useRef(new Map<string, Set<string>>())
  const a = useActions(commit, stateRef, catalog, queue, changed, toast)
  const d = useMemo(() => deriveUserData(state, catalog), [state, catalog])

  useEffect(() => {
    document.documentElement.classList.toggle('calm', !!state.settings.reduceMotion)
  }, [state.settings.reduceMotion])

  // `sync` muda a cada mudança da fila, então quem usa isSaving é redesenhado na hora certa.
  const isSaving = useMemo(() => (key: string) => sync.isPending(key), [sync])
  const value = useMemo(
    () => ({ catalog, s: state, d, a, isSaving, toast, toasts, dismissToast }),
    [catalog, state, d, a, isSaving, toast, toasts, dismissToast],
  )
  return <AppContext value={value}>{children}</AppContext>
}

/** Acesso ao estado do aluno, aos dados calculados, às ações e aos avisos (toasts). */
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppStateProvider>')
  return ctx
}
