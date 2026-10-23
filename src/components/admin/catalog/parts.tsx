import type { CourseImage } from '@/lib/media'
import { Art } from '@/components/ui/Art'
import { Icon, type IconName } from '@/components/ui/Icon'
import { STATUS_INFO, statusText, type CourseStatus } from '@/lib/admin/catalog'
import type { Tone } from '@/lib/types'

/** Peças pequenas do cadastro de cursos (funcionam no servidor e no navegador). */

const BADGE = { muted: '', info: ' ad-badge-info', ok: ' ad-badge-ok', warn: ' ad-badge-warn' } as const

export function StatusBadge({ status, publishAt }: { status: CourseStatus; publishAt?: string | null }) {
  const info = STATUS_INFO[status]
  return (
    <span className={'ad-badge' + BADGE[info.tone]}>
      <Icon name={info.icon as IconName} size={12} />
      {statusText(status, publishAt ?? null)}
    </span>
  )
}

/** Miniatura do curso: a imagem escolhida (miniatura ou capa) ou a arte padrão (cor + letra). */
export function CourseThumb({ tone, glyph, size = 44, image }: { tone: Tone; glyph: string; size?: number; image?: CourseImage | null }) {
  return (
    <span className="ad-cthumb" style={{ width: Math.round(size * 1.6), height: size }} aria-hidden="true">
      <Art tone={tone} glyph={glyph} ratio="auto" image={image ?? undefined} />
    </span>
  )
}

/** Hora local no formato do <input type="datetime-local">. */
export function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function fromLocalInput(value: string) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
