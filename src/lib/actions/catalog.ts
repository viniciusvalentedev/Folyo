'use server'

import { z } from 'zod'
import { COURSE_STATUSES, duplicateCourse, ID_PATTERN, slugify } from '@/lib/admin/catalog'
import { categorySchema, courseSchema } from '@/lib/admin/catalog-schema'
import { getFullCatalog } from '@/lib/data/catalog'
import { allow } from '@/lib/security/rate-limit'
import { ADMIN_RATE, fromDb, TOO_MANY, type AdminFailure } from './admin-shared'
import { actionContext, EXPIRED, INVALID } from './shared'

/**
 * Ações do cadastro de cursos, categorias e aulas (rodam SÓ no servidor).
 *
 * Mesma ideia das ações de usuários (admin.ts): aqui só se valida o formato e se repassa
 * para as funções do banco (admin_*), que conferem o papel de quem chamou (editor ou
 * administrador), as regras de publicação, conflitos de edição e gravam o histórico.
 */

type Fail = AdminFailure
export type DoneResult = { ok: true } | Fail
export type SaveResult = { ok: true; id: string; updatedAt: string | null } | Fail

const idSchema = z.string().regex(ID_PATTERN)
const savedSchema = z.object({ id: idSchema, updatedAt: z.string().max(64).optional() })

async function gate() {
  const ctx = await actionContext()
  if (!ctx) return { fail: EXPIRED as Fail }
  if (!allow('admin:' + ctx.user.id, ADMIN_RATE)) return { fail: TOO_MANY as Fail }
  return { ctx }
}

// ---------- Cursos ----------

const saveCourseSchema = z.object({
  course: courseSchema,
  isNew: z.boolean(),
  /** "updatedAt" que a tela leu; o banco recusa se o curso mudou desde então. */
  expected: z.string().max(64).nullable(),
  force: z.boolean().default(false),
})

/** Cria ou edita um curso inteiro (módulos, aulas e materiais) numa operação só. */
export async function saveCourseAction(input: unknown): Promise<SaveResult> {
  const parsed = saveCourseSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail

  const { course, isNew, expected, force } = parsed.data
  // Curso novo com endereço já usado: tenta "nome-2", "nome-3"... (até 6 tentativas).
  for (let attempt = 1; attempt <= 6; attempt++) {
    const id = attempt === 1 ? course.id : `${course.id.slice(0, 40 - String(attempt).length - 1).replace(/-+$/, '')}-${attempt}`
    const { data, error } = await ctx.supabase.rpc('admin_save_course', {
      p_course: { ...course, id },
      p_is_new: isNew,
      p_expected: isNew ? null : expected,
      p_force: force,
    })
    if (error) {
      if (isNew && error.code === 'FA410' && attempt < 6) continue
      return fromDb('admin_save_course', ctx.user.id, error)
    }
    const saved = savedSchema.safeParse(data)
    if (!saved.success) return { ok: false, error: 'Salvou, mas a resposta veio estranha. Recarregue a página.' }
    const sale = await saveSale(ctx, saved.data.id, course.priceCents, course.promo)
    if (!sale.ok) return sale
    return { ok: true, id: saved.data.id, updatedAt: saved.data.updatedAt ?? null }
  }
  return { ok: false, error: 'Não foi possível criar um endereço livre para este curso. Mude o título.' }
}

/**
 * Preço e "liberar com cupom" ficam numa função própria do banco (admin_set_course_sale), chamada
 * logo depois de salvar o curso. Sem o SQL do cupom de lançamento, um curso gratuito salva normal.
 */
async function saveSale(ctx: NonNullable<Awaited<ReturnType<typeof actionContext>>>, id: string, priceCents: number | null, promo: boolean): Promise<DoneResult> {
  const { error } = await ctx.supabase.rpc('admin_set_course_sale', { p_id: id, p_price_cents: priceCents, p_promo: promo })
  if (!error) return { ok: true }
  if (error.code === 'PGRST202') {
    if (priceCents === null && !promo) return { ok: true }
    return { ok: false, error: 'O curso foi salvo, mas o preço não: rode no Supabase o SQL do cupom de lançamento (veja supabase/README.md).' }
  }
  const fail = fromDb('admin_set_course_sale', ctx.user.id, error)
  return { ...fail, error: 'O curso foi salvo, mas o preço não. ' + fail.error }
}

const statusSchema = z.object({
  id: idSchema,
  status: z.enum(COURSE_STATUSES as [string, ...string[]]),
  publishAt: z.string().max(40).nullable().default(null),
})

/** Publica, despublica, agenda ou volta para rascunho (o banco confere "o que falta para publicar"). */
export async function setCourseStatusAction(input: unknown): Promise<DoneResult> {
  const parsed = statusSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_set_course_status', {
    p_id: parsed.data.id,
    p_status: parsed.data.status,
    p_publish_at: parsed.data.publishAt,
  })
  return error ? fromDb('admin_set_course_status', ctx.user.id, error) : { ok: true }
}

/** Duplica um curso como rascunho (novos ids em módulos, aulas e materiais). */
export async function duplicateCourseAction(input: unknown): Promise<SaveResult> {
  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const catalog = await getFullCatalog()
  const original = catalog.courses.find((c) => c.id === parsed.data.id)
  if (!original) return { ok: false, error: 'Curso não encontrado. Ele pode ter sido excluído.', code: 'FA404' }
  const base = slugify(original.title + ' copia')
  for (let attempt = 1; attempt <= 6; attempt++) {
    const id = attempt === 1 ? base : `${base.slice(0, 36).replace(/-+$/, '')}-${attempt}`
    const copy = duplicateCourse(original, id)
    // O título também precisa ser único: "Curso (cópia)", "Curso (cópia 2)"...
    copy.title = (attempt === 1 ? `${original.title} (cópia)` : `${original.title} (cópia ${attempt})`).slice(0, 90)
    const { data, error } = await ctx.supabase.rpc('admin_save_course', {
      p_course: copy,
      p_is_new: true,
      p_expected: null,
      p_force: false,
    })
    if (error) {
      // Endereço já usado (FA410) ou título repetido (FA400 "Já existe um curso com esse título"): tenta o próximo.
      if (attempt < 6 && (error.code === 'FA410' || /esse título/.test(error.message ?? ''))) continue
      return fromDb('admin_save_course', ctx.user.id, error)
    }
    const saved = savedSchema.safeParse(data)
    if (!saved.success) return { ok: false, error: 'Recarregue a página.' }
    // A cópia leva o preço e a opção do cupom (se falhar, a cópia fica gratuita: dá para ajustar no editor).
    if (copy.priceCents !== null || copy.promo) await saveSale(ctx, saved.data.id, copy.priceCents, copy.promo)
    return { ok: true, id: saved.data.id, updatedAt: saved.data.updatedAt ?? null }
  }
  return { ok: false, error: 'Não foi possível duplicar o curso agora.' }
}

const featuredSchema = z.object({ id: idSchema, featured: z.boolean() })

export async function setFeaturedAction(input: unknown): Promise<DoneResult> {
  const parsed = featuredSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_set_featured', { p_id: parsed.data.id, p_featured: parsed.data.featured })
  return error ? fromDb('admin_set_featured', ctx.user.id, error) : { ok: true }
}

const lessonPublishedSchema = z.object({ lessonId: idSchema, published: z.boolean() })

/** Publica ou esconde uma aula (usado na lista "Módulos e aulas"). */
export async function setLessonPublishedAction(input: unknown): Promise<DoneResult> {
  const parsed = lessonPublishedSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_set_lesson_published', {
    p_lesson: parsed.data.lessonId,
    p_published: parsed.data.published,
  })
  return error ? fromDb('admin_set_lesson_published', ctx.user.id, error) : { ok: true }
}

const deleteSchema = z.object({ id: idSchema })

/** Exclui um curso. Só administrador, e só se nenhum aluno começou (o banco confere as duas coisas). */
export async function deleteCourseAction(input: unknown): Promise<DoneResult> {
  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_delete_course', { p_id: parsed.data.id })
  return error ? fromDb('admin_delete_course', ctx.user.id, error) : { ok: true }
}

// ---------- Categorias ----------

const saveCategorySchema = z.object({ category: categorySchema, isNew: z.boolean() })

export async function saveCategoryAction(input: unknown): Promise<SaveResult> {
  const parsed = saveCategorySchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { category, isNew } = parsed.data
  for (let attempt = 1; attempt <= 6; attempt++) {
    const id = attempt === 1 ? category.id : `${category.id.slice(0, 36).replace(/-+$/, '')}-${attempt}`
    const { data, error } = await ctx.supabase.rpc('admin_save_category', { p_category: { ...category, id }, p_is_new: isNew })
    if (error) {
      if (isNew && error.code === 'FA410' && attempt < 6) continue
      return fromDb('admin_save_category', ctx.user.id, error)
    }
    const saved = savedSchema.safeParse(data)
    return saved.success ? { ok: true, id: saved.data.id, updatedAt: null } : { ok: false, error: 'Recarregue a página.' }
  }
  return { ok: false, error: 'Não foi possível criar um endereço livre para a categoria. Mude o nome.' }
}

/** Exclui uma categoria (o banco recusa se ainda há cursos nela). */
export async function deleteCategoryAction(input: unknown): Promise<DoneResult> {
  const parsed = deleteSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_delete_category', { p_id: parsed.data.id })
  return error ? fromDb('admin_delete_category', ctx.user.id, error) : { ok: true }
}

const reorderSchema = z.object({ kind: z.enum(['cursos', 'categorias']), ids: z.array(idSchema).min(1).max(600) })

/** Grava a ordem do catálogo (lista completa de ids na nova ordem). */
export async function reorderAction(input: unknown): Promise<DoneResult> {
  const parsed = reorderSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_reorder', { p_kind: parsed.data.kind, p_ids: parsed.data.ids })
  return error ? fromDb('admin_reorder', ctx.user.id, error) : { ok: true }
}

// ---------- Tags ----------

const tagSchema = z.string().trim().min(1).max(30)
const tagsSchema = z.object({ tags: z.array(tagSchema).max(100) })

export async function saveTagsAction(input: unknown): Promise<DoneResult> {
  const parsed = tagsSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_save_tags', { p_tags: parsed.data.tags })
  return error ? fromDb('admin_save_tags', ctx.user.id, error) : { ok: true }
}

/** `to` vazio = remover a tag de todos os cursos. */
const renameTagSchema = z.object({ from: tagSchema, to: z.string().trim().max(30) })

/** Renomeia uma tag em todos os cursos que a usam. */
export async function renameTagAction(input: unknown): Promise<DoneResult> {
  const parsed = renameTagSchema.safeParse(input)
  if (!parsed.success) return INVALID
  const { fail, ctx } = await gate()
  if (!ctx) return fail
  const { error } = await ctx.supabase.rpc('admin_rename_tag', { p_from: parsed.data.from, p_to: parsed.data.to })
  return error ? fromDb('admin_rename_tag', ctx.user.id, error) : { ok: true }
}
