import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['pl', 'en', 'ru', 'uk'],
  defaultLocale: 'pl',
  localePrefix: 'as-needed',
});

export type Locale = (typeof routing.locales)[number];
