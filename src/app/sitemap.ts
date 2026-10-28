import type { MetadataRoute } from 'next'
import { INDEXABLE_PATHS, SITE_URL } from '@/lib/seo'

/**
 * /sitemap.xml: a lista de páginas que o Google deve visitar.
 * Só entram as páginas abertas a todos; a área do aluno exige login e fica de fora.
 */
const SETTINGS: Record<(typeof INDEXABLE_PATHS)[number], { changeFrequency: 'weekly' | 'yearly'; priority: number }> = {
  '/': { changeFrequency: 'weekly', priority: 1 },
  '/termos': { changeFrequency: 'yearly', priority: 0.3 },
  '/privacidade': { changeFrequency: 'yearly', priority: 0.3 },
}

export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({
    url: path === '/' ? `${SITE_URL}/` : `${SITE_URL}${path}`,
    ...SETTINGS[path],
  }))
}
