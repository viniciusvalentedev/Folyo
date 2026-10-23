import { hasVideo, type AdminCatalog } from '@/lib/admin/catalog'

export type ContentAlert = { key: string; icon: string; text: string; href: string }

const names = (list: { title: string }[]) => `${list.slice(0, 2).map((c) => c.title).join(', ')}${list.length > 2 ? '…' : ''}`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Avisos da visão geral para a equipe de conteúdo. Os limites vêm das Configurações. */
export function contentAlerts(catalog: AdminCatalog, rules: { draftStaleDays: number; alertMissingVideo: boolean }): ContentAlert[] {
  const now = Date.now()
  const out: ContentAlert[] = []
  const staleMs = rules.draftStaleDays * 86_400_000

  const stale = catalog.courses.filter((c) => c.status === 'rascunho' && c.updatedAt && now - Date.parse(c.updatedAt) > staleMs)
  if (stale.length) out.push({ key: 'stale', icon: 'Clock', text: `${plural(stale.length, 'rascunho parado', 'rascunhos parados')} há mais de ${rules.draftStaleDays} dias: ${names(stale)}`, href: '/admin/cursos' })

  const live = catalog.courses.filter((c) => c.status === 'publicado')
  const noCover = live.filter((c) => !c.images.cover)
  if (noCover.length) {
    out.push({
      key: 'cover',
      icon: 'Image',
      text: `${plural(noCover.length, 'curso publicado sem capa', 'cursos publicados sem capa')}: ${names(noCover)}`,
      href: noCover.length === 1 ? `/admin/cursos/${noCover[0].id}?aba=visual` : '/admin/cursos',
    })
  }

  if (rules.alertMissingVideo) {
    const missing = live.reduce((n, c) => n + c.modules.filter((m) => !m.archived).reduce((k, m) => k + m.lessons.filter((l) => l.published && !hasVideo(l.video)).length, 0), 0)
    if (missing) out.push({ key: 'video', icon: 'VideoOff', text: plural(missing, 'aula publicada sem vídeo', 'aulas publicadas sem vídeo'), href: '/admin/aulas' })
  }

  const scheduled = catalog.courses.filter((c) => c.status === 'agendado')
  if (scheduled.length) out.push({ key: 'sched', icon: 'Calendar', text: `${plural(scheduled.length, 'curso agendado', 'cursos agendados')} para publicar`, href: '/admin/cursos' })
  return out
}
