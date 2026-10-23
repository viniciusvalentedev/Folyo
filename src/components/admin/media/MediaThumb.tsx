import { Icon } from '@/components/ui/Icon'
import { imageUrl, type MediaItem } from '@/lib/media'

/** Miniatura de um arquivo da biblioteca: a própria imagem, ou o ícone de PDF. */
export function MediaThumb({ item, ratio = '16 / 10' }: { item: Pick<MediaItem, 'kind' | 'path' | 'alt' | 'name'>; ratio?: string }) {
  return (
    <span className="ad-mthumb" style={{ aspectRatio: ratio }}>
      {item.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem pública do Storage
        <img src={imageUrl(item.path)} alt={item.alt} loading="lazy" decoding="async" />
      ) : (
        <span className="ad-mthumb-file">
          <Icon name="FileText" size={28} />
          <small>PDF</small>
        </span>
      )}
    </span>
  )
}
