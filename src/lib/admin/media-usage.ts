import type { AdminCatalog } from '@/lib/admin/catalog'
import { SLOT_INFO, type ImageSlot, type MediaUse } from '@/lib/media'

/** Onde cada arquivo da biblioteca é usado (capas, miniaturas, banners, materiais de aula e imagens de categoria). */
export function mediaUsage(catalog: AdminCatalog): Record<string, MediaUse[]> {
  const out: Record<string, MediaUse[]> = {}
  const add = (id: string, use: MediaUse) => (out[id] ??= []).push(use)
  for (const c of catalog.courses) {
    const published = c.status === 'publicado'
    for (const slot of Object.keys(SLOT_INFO) as ImageSlot[]) {
      const ref = c.images[slot]
      if (ref) add(ref.media, { courseId: c.id, courseTitle: c.title, where: SLOT_INFO[slot].label, published })
    }
    for (const m of c.modules) {
      for (const l of m.lessons) {
        for (const x of l.materials) if (x.media) add(x.media, { courseId: c.id, courseTitle: c.title, where: `Material · ${l.title || 'aula sem título'}`, published })
      }
    }
  }
  for (const cat of catalog.categories) {
    if (cat.media) add(cat.media, { courseId: null, courseTitle: cat.name, where: 'Imagem da categoria', published: false, categoryId: cat.id })
  }
  return out
}
