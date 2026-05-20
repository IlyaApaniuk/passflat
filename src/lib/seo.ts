import { routing } from '@/i18n/routing';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://passflat.pl';

export function getAlternates(pathname: string) {
  const languages: Record<string, string> = {};

  for (const locale of routing.locales) {
    languages[locale] =
      locale === routing.defaultLocale
        ? `${baseUrl}${pathname}`
        : `${baseUrl}/${locale}${pathname}`;
  }

  languages['x-default'] = `${baseUrl}${pathname}`;

  return { canonical: `${baseUrl}${pathname}`, languages };
}
