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
import type { PublicConfig } from '@/lib/app-config'
import type { ActionResult } from '@/lib/actions/shared'
import {
  deleteSkillAction,
  markNotificationsReadAction,
  saveCourseProgressAction,
  saveLessonNoteAction,
  saveProfileAction,
  saveResumeAction,
  saveSettingsAction,
  saveSkillAction,
  saveLessonWatchAction,
  setLessonDoneAction,
} from '@/lib/actions/student'
import { confirmNewPdfAction, confirmReplacePdfAction, deleteWorkAction, preparePdfUploadAction, saveWorkAction } from '@/lib/actions/works'
import { deriveUserData } from '@/lib/domain/derive'
import { findCourse, findLesson, sameText } from '@/lib/domain/catalog'
import { newId, newUuid, todayISO } from '@/lib/format'
import { computeOnboarding, findTrail, type OnboardingResult } from '@/lib/trails'
import { pdfProblem } from '@/lib/pdf-file'
import { LIST_MAX, MAX_PDFS, MAX_WORKS, normalizeWorkUrl, WORK_DESC_MAX, WORK_TITLE_MAX } from '@/lib/validation'
import type {
  Catalog,
  Derived,
  ProfileListKey,
  ResumeSection,
  ResumeState,
  Settings,
  Skill,
  UserProfile,
  UserState,
  Work,
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
const RESUME_FIELDS = new Set(['template', 'order', 'hidden', 'certs'])
const GOAL_FIELDS = new Set(['primary', 'secondary', 'text', 'skills', 'wants'])
const GOAL_TEXT_MAX = 160
const GOAL_SKILLS_MAX = 40
/** Tempo assistido: manda ao servidor no máximo a cada 10 s por aula. */
const WATCH_DELAY = 10_000

/** Só os campos que o aluno pode mudar num trabalho (o arquivo de um PDF tem fluxo próprio). */
function toStoredWork(w: Work) {
  return { id: w.id, courseId: w.courseId, kind: w.kind, title: w.title, desc: w.desc, url: w.url, public: w.public, inCV: w.inCV }
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

/**
 * Passos 1 e 2 do envio de PDF: pede o endereço de envio ao servidor e manda o arquivo
 * direto para o Storage privado (a Vercel não aceita arquivos grandes no servidor).
 */
async function sendPdf(file: File): Promise<{ ok: true; fileId: string } | { ok: false; error: string }> {
  try {
    const ticket = await preparePdfUploadAction({ size: file.size })
    if (!ticket.ok) return ticket
    const res = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'application/pdf', apikey: ticket.apiKey },
      body: file,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    if (!res.ok) {
      return { ok: false, error: res.status === 413 ? 'O PDF é maior que o limite de 20 MB.' : 'Não foi possível enviar o arquivo. Tente de novo.' }
    }
    return { ok: true, fileId: ticket.fileId }
  } catch {
    return { ok: false, error: OFFLINE }
  }
}

type Job = () => Promise<ActionResult>
type Sync = {
  schedule: (key: string, job: Job, delay?: number) => void
  flush: () => void
  /** Esta chave ainda tem algo esperando para ser gravado (ou sendo gravado)? */
  isPending: (key: string) => boolean
  /** Esta chave está na fila esperando para ser enviada (ainda não começou a gravar)? */
  isQueued: (key: string) => boolean
}

/**
 * Fila de gravação no servidor.
 *
 * A tela muda na hora (o aluno não espera) e, logo depois, o servidor grava.
 *  - Cada "chave" (ex.: "work:<id>") tem no máximo um pedido por vez, e sempre
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
      isQueued(key) {
        return queued.current.has(key)
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

    // Cada "chave" sincroniza o estado ATUAL de uma coisa (um curso, uma aula, um trabalho...).
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
    /** Trabalho existe no estado → salva; não existe mais → apaga (a linha e o arquivo). */
    const syncWork = (wid: string, delay = 0) =>
      sync.schedule('work:' + wid, () => {
        const w = now().works.find((x) => x.id === wid)
        return w ? saveWorkAction(toStoredWork(w)) : deleteWorkAction(wid)
      }, delay)
    /**
     * Tempo assistido: a tela soma na hora e o servidor recebe o TOTAL da aula, no máximo
     * a cada 10 s (o banco só aceita total que cresce no ritmo do relógio).
     */
    const syncWatch = (lid: string) => {
      const found = findLesson(catalog, lid)
      if (!found || sync.isQueued('watch:' + lid)) return
      sync.schedule('watch:' + lid, () => {
        const seconds = Math.min(86400, Math.floor(now().watch[lid] ?? 0))
        const position = Math.min(86400, Math.floor(now().position[lid] ?? 0))
        // Manda o ponto em que a pessoa parou junto com o total assistido (uma gravação só).
        return seconds >= 1 || position >= 1
          ? saveLessonWatchAction({ courseId: found.course.id, lessonId: lid, seconds, position })
          : Promise.resolve(OK_RESULT)
      }, WATCH_DELAY)
    }
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
    const syncGoals = (fields: Iterable<string>, delay = 300) => {
      mark('goals', [...fields].filter((f) => GOAL_FIELDS.has(f)))
      sync.schedule('goals', patchJob('goals', () => now().goals, saveGoalsAction), delay)
    }

  /** Edita título, descrição, endereço (links) e visibilidade. O curso e o arquivo não mudam por aqui. */
  const updateWork = (id: string, patch: Partial<Pick<Work, 'title' | 'desc' | 'url' | 'public' | 'inCV'>>) => {
      const current = now().works.find((w) => w.id === id)
      if (!current) return { ok: false as const, error: 'Material não encontrado.' }
      const next: typeof patch = { ...patch }
      if (next.title !== undefined) {
        next.title = next.title.trim().slice(0, WORK_TITLE_MAX)
        if (!next.title) return { ok: false as const, error: 'O título não pode ficar vazio.' }
      }
      if (next.desc !== undefined) next.desc = next.desc.trim().slice(0, WORK_DESC_MAX)
      if (next.url !== undefined) {
        if (current.kind !== 'link') return { ok: false as const, error: 'Só links têm endereço.' }
        const url = normalizeWorkUrl(next.url ?? '')
        if ('error' in url) return { ok: false as const, error: url.error }
        next.url = url.url
      }
      const adding = next.inCV === true
      commit((s) => {
        const w = s.works.find((x) => x.id === id)
        if (!w) return
        Object.assign(w, next, { updatedAt: new Date().toISOString() })
        if (adding) {
          if (!s.resume.order.includes('projetos')) s.resume.order.push('projetos')
          s.resume.hidden = s.resume.hidden.filter((x) => x !== 'projetos')
        }
        if (next.inCV !== undefined) s.resume.dirty = true
      })
      syncWork(id, 'title' in next || 'desc' in next || 'url' in next ? TYPING_DELAY : 0)
      if (adding) syncResume(['order', 'hidden'])
      return { ok: true as const }
    }

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
      /** Novo trabalho do tipo LINK (o PDF tem o fluxo `uploadPdf`). */
      addLinkWork: (input: { courseId: string | null; title: string; desc: string; url: string; public: boolean }) => {
        const url = normalizeWorkUrl(input.url)
        if ('error' in url) return { ok: false as const, error: url.error }
        const title = input.title.trim().slice(0, WORK_TITLE_MAX)
        if (!title) return { ok: false as const, error: 'Dê um título para o link.' }
        if (input.courseId && !findCourse(catalog, input.courseId)) return { ok: false as const, error: 'Curso não encontrado.' }
        if (now().works.length >= MAX_WORKS) {
          return { ok: false as const, error: `Você chegou ao limite de ${MAX_WORKS} materiais. Apague alguns para criar novos.` }
        }
        const id = newUuid()
        const at = new Date().toISOString()
        commit((s) => {
          s.works.unshift({
            id,
            courseId: input.courseId,
            kind: 'link',
            title,
            desc: input.desc.trim().slice(0, WORK_DESC_MAX),
            url: url.url,
            file: null,
            public: input.public,
            inCV: false,
            createdAt: at,
            updatedAt: at,
          })
        })
        syncWork(id)
        return { ok: true as const, id }
      },
      updateWork,
      /** Marca ou desmarca o trabalho no currículo (e mostra a seção Projetos se estava escondida). */
      toggleWorkCV: (id: string, on?: boolean) => {
        const w = now().works.find((x) => x.id === id)
        if (!w) return
        return updateWork(id, { inCV: on === undefined ? !w.inCV : on })
      },
      removeWork: (id: string) => {
        commit((s) => {
          s.works = s.works.filter((w) => w.id !== id)
        })
        syncWork(id)
      },
      /**
       * Envia um PDF para um curso (ou "fora da Folyo"). O arquivo vai direto para o Storage
       * privado e o servidor só cria o trabalho depois de conferir que é mesmo um PDF.
       */
      uploadPdf: async (file: File, input: { courseId: string | null; title: string }) => {
        const checked = await pdfProblem(file)
        if (checked) return { ok: false as const, error: checked }
        if (now().works.length >= MAX_WORKS) {
          return { ok: false as const, error: `Você chegou ao limite de ${MAX_WORKS} materiais. Apague alguns para enviar novos.` }
        }
        if (now().works.filter((w) => w.kind === 'pdf').length >= MAX_PDFS) {
          return { ok: false as const, error: `Você chegou ao limite de ${MAX_PDFS} PDFs. Apague alguns para enviar novos.` }
        }
        const stored = await sendPdf(file)
        if (!stored.ok) return stored
        const result = await confirmNewPdfAction({
          fileId: stored.fileId,
          courseId: input.courseId,
          fileName: file.name || 'documento.pdf',
          title: input.title.trim().slice(0, WORK_TITLE_MAX),
        })
        if (!result.ok) return result
        commit((s) => {
          if (!s.works.some((w) => w.id === result.work.id)) s.works.unshift(result.work)
        })
        return { ok: true as const, id: result.work.id }
      },
      /** Troca o arquivo de um PDF que já existe (o título e as marcações continuam). */
      replacePdf: async (workId: string, file: File) => {
        const current = now().works.find((w) => w.id === workId)
        if (!current || current.kind !== 'pdf') return { ok: false as const, error: 'Material não encontrado.' }
        const checked = await pdfProblem(file)
        if (checked) return { ok: false as const, error: checked }
        const stored = await sendPdf(file)
        if (!stored.ok) return stored
        const result = await confirmReplacePdfAction({ fileId: stored.fileId, workId, fileName: file.name || 'documento.pdf' })
        if (!result.ok) return result
        commit((s) => {
          const w = s.works.find((x) => x.id === workId)
          if (w) Object.assign(w, { file: result.work.file, updatedAt: result.work.updatedAt })
        })
        return { ok: true as const }
      },
      /** Tempo assistido (segundos) medido pelo player: soma na tela e sincroniza aos poucos. */
      addWatch: (lid: string, seconds: number) => {
        if (!(seconds > 0) || !findLesson(catalog, lid)) return
        commit((s) => {
          s.watch[lid] = Math.min(86400, Math.round(((s.watch[lid] ?? 0) + Math.min(seconds, 120)) * 10) / 10)
        })
        syncWatch(lid)
      },
      /** Ponto do vídeo em que a pessoa parou (segundos). 0 = recomeça do início (ex.: terminou a aula). */
      savePosition: (lid: string, seconds: number) => {
        if (!Number.isFinite(seconds) || !findLesson(catalog, lid)) return
        const at = Math.min(86400, Math.max(0, Math.floor(seconds)))
        const changed = commit((s) => {
          if ((s.position[lid] ?? 0) === at) return false
          if (at === 0) delete s.position[lid]
          else s.position[lid] = at
          return true
        })
        if (changed) syncWatch(lid)
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
          const trail = findTrail(catalog.trails, id)
          if (!trail?.active || s.goals.primary === id) return false
          s.goals.secondary = [s.goals.primary, ...s.goals.secondary.filter((g) => g !== id)]
            .filter((g): g is string => !!g)
            .slice(0, 2)
          s.goals.primary = id
          return true
        })
        if (changed) syncGoals(['primary', 'secondary'])
      },
      toggleSecondaryGoal: (id: string) => {
        const changed = commit((s) => {
          const trail = findTrail(catalog.trails, id)
          if (!trail || id === s.goals.primary || !s.goals.primary) return false
          // Trilha desativada: dá para tirar de quem já a escolheu, mas não para adicionar.
          if (!trail.active && !s.goals.secondary.includes(id)) return false
          s.goals.secondary = s.goals.secondary.includes(id)
            ? s.goals.secondary.filter((g) => g !== id)
            : [...s.goals.secondary, id].slice(-2)
          return true
        })
        if (changed) syncGoals(['secondary'])
      },
      /** Objetivo escrito com as próprias palavras (até 160 letras). */
      setGoalText: (text: string) => {
        commit((s) => {
          s.goals.text = text.slice(0, GOAL_TEXT_MAX)
        })
        syncGoals(['text'], TYPING_DELAY)
      },
      toggleGoalSkill: (name: string) => {
        const clean = name.trim().slice(0, 60)
        if (!clean) return
        const full = commit((s) => {
          const has = s.goals.skills.some((k) => sameText(k, clean))
          if (!has && s.goals.skills.length >= GOAL_SKILLS_MAX) return true
          s.goals.skills = has ? s.goals.skills.filter((k) => !sameText(k, clean)) : [...s.goals.skills, clean]
          return false
        })
        if (full) notify(`Você pode acompanhar até ${GOAL_SKILLS_MAX} skills.`, 'err')
        else syncGoals(['skills'])
      },
      /** Adota uma trilha como objetivo: soma as skills dela às suas ou troca todas. */
      applyTrail: (id: string, mode: 'somar' | 'substituir' = 'somar') => {
        const trail = findTrail(catalog.trails, id)
        if (!trail?.active) return
        commit((s) => {
          if (s.goals.primary !== trail.id) {
            s.goals.secondary = s.goals.secondary.filter((g) => g !== trail.id)
            if (s.goals.primary) s.goals.secondary = [s.goals.primary, ...s.goals.secondary].slice(0, 2)
          }
          s.goals.primary = trail.id
          s.goals.text = trail.title.slice(0, GOAL_TEXT_MAX)
          s.goals.skills =
            mode === 'substituir'
              ? [...trail.skills]
              : [...s.goals.skills, ...trail.skills.filter((k) => !s.goals.skills.some((x) => sameText(x, k)))].slice(0, GOAL_SKILLS_MAX)
        })
        syncGoals(['primary', 'secondary', 'text', 'skills'])
      },
      setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => {
        commit((s) => {
          s.settings[key] = value
        })
        syncSettings(key)
      },
      /** Guarda na tela o endereço do perfil público depois que o servidor confirmou (o salvamento é a ação própria, não a fila). */
      setPublicSlug: (slug: string) => {
        commit((s) => {
          s.publicSlug = slug
        })
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
      /**
       * Atualiza a tela depois que o primeiro acesso foi salvo no banco (pela própria tela).
       * Usa a mesma função que o servidor, então o que aparece é o que foi gravado.
       */
      completeOnboarding: (input: { stage: string; areas: string[]; wants: string[] }): OnboardingResult | null => {
        const result = computeOnboarding(input, catalog.trails)
        if (!result) return null
        commit((s) => {
          s.onboarded = true
          s.user.stage = result.stage
          s.user.interests = result.interests
          s.user.exploring = result.exploring
          if (!s.user.headline.trim()) s.user.headline = result.headline
          s.goals = { primary: result.primary, secondary: [], text: result.text, skills: result.skills, wants: result.wants }
        })
        return result
      },
    }
  }, [commit, stateRef, catalog, sync, changed, notify])
}

export type Actions = ReturnType<typeof useActions>

type AppContextValue = {
  catalog: Catalog
  /** Configurações públicas da plataforma (nome, e-mail de suporte, ordenação do catálogo...). */
  config: PublicConfig
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
  config,
  initialState,
  children,
}: {
  catalog: Catalog
  config: PublicConfig
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

  const { schedule, flush, isPending, isQueued } = sync
  const queue = useMemo<Sync>(() => ({ schedule, flush, isPending, isQueued }), [schedule, flush, isPending, isQueued])
  const changed = useRef(new Map<string, Set<string>>())
  const a = useActions(commit, stateRef, catalog, queue, changed, toast)
  const d = useMemo(() => deriveUserData(state, catalog), [state, catalog])

  useEffect(() => {
    document.documentElement.classList.toggle('calm', !!state.settings.reduceMotion)
  }, [state.settings.reduceMotion])

  // `sync` muda a cada mudança da fila, então quem usa isSaving é redesenhado na hora certa.
  const isSaving = useMemo(() => (key: string) => sync.isPending(key), [sync])
  const value = useMemo(
    () => ({ catalog, config, s: state, d, a, isSaving, toast, toasts, dismissToast }),
    [catalog, config, state, d, a, isSaving, toast, toasts, dismissToast],
  )
  return <AppContext value={value}>{children}</AppContext>
}

/** Acesso ao estado do aluno, aos dados calculados, às ações e aos avisos (toasts). */
export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp precisa estar dentro de <AppStateProvider>')
  return ctx
}
