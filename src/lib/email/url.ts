import { SITE_URL } from '@/lib/site-url';
import type { EmailLocale } from './types';

/**
 * Build an absolute, locale-prefixed URL for use in outgoing emails. Emails are
 * sent outside any request context, so they must always carry an explicit locale
 * prefix (unlike in-app links that rely on `as-needed` prefixing).
 */
export function localeUrl(locale: EmailLocale, path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}/${locale}${normalized}`;
}
