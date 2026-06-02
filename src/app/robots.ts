import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';
import { isIndexable } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  if (!isIndexable) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/dashboard/', '/messages/', '/create-listing/', '/auth/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
