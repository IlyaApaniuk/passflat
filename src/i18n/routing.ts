import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pl', 'en', 'ru', 'uk'],
  defaultLocale: 'pl',
  localePrefix: 'as-needed',
  // No NEXT_LOCALE cookie: a Set-Cookie on every response makes the CDN treat
  // every page as private and bypass the ISR cache entirely — every new visitor
  // and every bot got a ~2s full SSR. The locale always lives in the URL, so
  // the cookie only ever remembered a manual switch for bare-`/` visits.
  localeCookie: false,
});

export type Locale = (typeof routing.locales)[number];
