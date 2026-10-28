import type { MetadataRoute } from 'next'
import { isIndexable, PRIVATE_PATHS, SITE_URL } from '@/lib/seo'

/**
 * /robots.txt: o que os robôs do Google podem visitar.
 * Fora da produção (desenvolvimento e previews) o site inteiro fica fechado.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: [...PRIVATE_PATHS] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
