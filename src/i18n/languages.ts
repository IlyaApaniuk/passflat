import { type Locale } from '@/i18n/routing';

/** Supported app languages with their native display labels. Single source of
 *  truth for the header switcher and the account language selector. */
export const LANGUAGES: { code: Locale; label: string }[] = [
  { code: 'pl', label: 'Polski' },
  { code: 'uk', label: 'Українська' },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
];
