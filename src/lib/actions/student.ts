'use server'

import { getCatalog } from '@/lib/data/catalog'
import { findCourse, findLesson } from '@/lib/domain/catalog'
import {
  courseProgressSchema,
  lessonDoneSchema,
  lessonNoteSchema,
  profilePatchSchema,
  resumePatchSchema,
  lessonWatchSchema,
  settingsPatchSchema,
  storedSkillSchema,
  uuidSchema,
} from '@/lib/validation'
import {
  actionContext,
  dbFailure,
  EXPIRED,
  INVALID,
  OK,
  updateOrInsert,
  type ActionResult,
} from './shared'

/**
 * Ações que salvam os dados do aluno (etapa 2). Rodam SÓ no servidor.
 *
 * Cada função exportada aqui é uma "porta" que qualquer pessoa pode chamar pela
 * internet, então TODAS seguem a mesma receita:
 *  1. confere quem está logado (sem login, nada acontece);
 *  2. valida os dados de novo com zod (nunca confia no navegador);
 *  3. confere no catálogo se o curso/aula existe;
 *  4. grava só as linhas do próprio aluno (filtro por user_id + RLS no banco).
 *
 * Todas são "idempotentes": mandam o estado final ("aula concluída = sim"), não um
 * "inverta". Repetir o mesmo pedido não estraga nada.
 */

/** Marca ou desmarca uma aula como concluída. A data é sempre a do servidor. */
export async function setLessonDoneAction(input: unknown): Promise<ActionResult> {
  const parsed = lessonDoneSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { courseId, lessonId, done } = parsed.data
  if (findLesson(await getCatalog(), lessonId)?.course.id !== courseId) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  if (done) {
    const { error } = await ctx.supabase.from('lesson_completions').insert({ course_id: courseId, lesson_id: lessonId })
    // 23505 = já estava concluída. Tudo certo.
    if (error && error.code !== '23505') return dbFailure('lesson_completions.insert', error)
    return OK
  }
  const { error } = await ctx.supabase
    .from('lesson_completions')
    .delete()
    .eq('user_id', ctx.user.id)
    .eq('lesson_id', lessonId)
  return error ? dbFailure('lesson_completions.delete', error) : OK
}

/** Progresso num curso: começou, última aula aberta e favorito. */
export async function saveCourseProgressAction(input: unknown): Promise<ActionResult> {
  const parsed = courseProgressSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { courseId, started, lastLessonId, favorite } = parsed.data
  const catalog = await getCatalog()
  if (!findCourse(catalog, courseId)) return INVALID
  if (lastLessonId && findLesson(catalog, lastLessonId)?.course.id !== courseId) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  return updateOrInsert(ctx, 'course_progress', { course_id: courseId }, { started, last_lesson_id: lastLessonId, favorite })
}

/** Anotação de uma aula. Texto vazio apaga a anotação. */
export async function saveLessonNoteAction(input: unknown): Promise<ActionResult> {
  const parsed = lessonNoteSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { courseId, lessonId, body } = parsed.data
  if (findLesson(await getCatalog(), lessonId)?.course.id !== courseId) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED

  if (!body.trim()) {
    const { error } = await ctx.supabase.from('lesson_notes').delete().eq('user_id', ctx.user.id).eq('lesson_id', lessonId)
    return error ? dbFailure('lesson_notes.delete', error) : OK
  }
  return updateOrInsert(ctx, 'lesson_notes', { lesson_id: lessonId }, { body }, { course_id: courseId })
}

/**
 * Tempo assistido de uma aula (total em segundos, medido pelo player) e o ponto em que a pessoa
 * parou (`position`, para continuar de onde parou).
 * O banco só deixa o total crescer e no máximo na velocidade do relógio, então um
 * pedido forjado não consegue "inventar" horas de estudo.
 */
export async function saveLessonWatchAction(input: unknown): Promise<ActionResult> {
  const parsed = lessonWatchSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { courseId, lessonId, seconds, position } = parsed.data
  if (findLesson(await getCatalog(), lessonId)?.course.id !== courseId) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const changes = position === undefined ? { seconds } : { seconds, position }
  return updateOrInsert(ctx, 'lesson_watch', { lesson_id: lessonId }, changes, { course_id: courseId })
}

/** Cria ou atualiza uma competência. */
export async function saveSkillAction(input: unknown): Promise<ActionResult> {
  const parsed = storedSkillSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const k = parsed.data
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  return updateOrInsert(ctx, 'skills', { id: k.id }, { name: k.name, type: k.type, in_cv: k.inCV, note: k.note })
}

export async function deleteSkillAction(id: unknown): Promise<ActionResult> {
  const parsed = uuidSchema.safeParse(id)
  if (!parsed.success) return INVALID
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { error } = await ctx.supabase.from('skills').delete().eq('user_id', ctx.user.id).eq('id', parsed.data)
  return error ? dbFailure('skills.delete', error) : OK
}

/** Atualiza só a linha do perfil do próprio aluno. */
async function updateOwnProfile(changes: Record<string, unknown>, where: string): Promise<ActionResult> {
  const ctx = await actionContext()
  if (!ctx) return EXPIRED
  const { data, error } = await ctx.supabase.from('profiles').update(changes).eq('id', ctx.user.id).select('id')
  if (error || !data || data.length !== 1) return dbFailure(where, error)
  return OK
}

/** Só as colunas que vieram no pedido (campos ausentes ficam como estão no banco). */
function pick(source: Record<string, unknown>, columns: Record<string, string>) {
  const out: Record<string, unknown> = {}
  for (const [field, column] of Object.entries(columns)) {
    if (source[field] !== undefined) out[column] = source[field]
  }
  return out
}

const PROFILE_COLUMNS = {
  name: 'name',
  headline: 'headline',
  city: 'city',
  email: 'contact_email',
  phone: 'phone',
  link: 'link',
  bio: 'bio',
  objective: 'objective',
  interests: 'interests',
  education: 'education',
  experiences: 'experiences',
  languages: 'languages',
  achievements: 'achievements',
}

/** Perfil e dados do currículo. Recebe só os campos que mudaram. */
export async function saveProfileAction(input: unknown): Promise<ActionResult> {
  const parsed = profilePatchSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const u = parsed.data
  return updateOwnProfile(
    pick({ ...u, interests: u.interests && [...new Set(u.interests)] }, PROFILE_COLUMNS),
    'profiles.profile',
  )
}

/** Organização do currículo (modelo, ordem das seções, o que aparece). Só os campos que mudaram. */
export async function saveResumeAction(input: unknown): Promise<ActionResult> {
  const parsed = resumePatchSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const r = parsed.data
  const courseIds = new Set((await getCatalog()).courses.map((c) => c.id))
  const unique = <T,>(list: T[] | undefined) => list && [...new Set(list)]
  return updateOwnProfile(
    pick(
      {
        template: r.template,
        order: unique(r.order),
        hidden: unique(r.hidden),
        certs: unique(r.certs)?.filter((id) => courseIds.has(id)),
      },
      { template: 'resume_template', order: 'resume_order', hidden: 'resume_hidden', certs: 'resume_certs' },
    ),
    'profiles.resume',
  )
}

/** Configurações (privacidade, notificações, aprendizagem e preferências). Só os campos que mudaram. */
export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  const parsed = settingsPatchSchema.safeParse(input)
  if (!parsed.success) return INVALID
  return updateOwnProfile(
    pick(parsed.data, {
      publicProfile: 'public_profile',
      showEmail: 'show_email',
      publicPortfolio: 'public_portfolio',
      notifyLessons: 'notify_lessons',
      notifyWeekly: 'notify_weekly',
      notifyNews: 'notify_news',
      studyTime: 'study_time',
      captions: 'captions',
      autoplay: 'autoplay',
      reduceMotion: 'reduce_motion',
    }),
    'profiles.settings',
  )
}

/** Marca os avisos do sino como lidos. */
export async function markNotificationsReadAction(): Promise<ActionResult> {
  return updateOwnProfile({ notifications_read_at: new Date().toISOString() }, 'profiles.notifications')
}
