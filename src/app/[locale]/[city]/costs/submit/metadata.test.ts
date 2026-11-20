import { createTranslator } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import en from '@/i18n/messages/en.json';
import pl from '@/i18n/messages/pl.json';
import ru from '@/i18n/messages/ru.json';
import uk from '@/i18n/messages/uk.json';
import { getAlternates } from '@/lib/seo';

/**
 * PRD 4 FR-28 (spec 09 §Sitemap, robots, structured data and the submit page's metadata):
 * the submit page has its own title and description in every locale, next to the canonical
 * and hreflang set it already had. A missing key throws instead of rendering its path.
 */

const MESSAGES = { en, pl, ru, uk } as const;
type Locale = keyof typeof MESSAGES;

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({
      locale,
      messages: MESSAGES[locale],
      namespace: namespace as never,
      onError: (error) => {
        throw error;
      },
    }),
}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('./client', () => ({ CostSubmitClient: () => null }));

import { generateMetadata } from './page';

const EXPECTED: Record<Locale, { title: string; description: string }> = {
  en: {
    title: 'Add the costs of your flat in Warsaw',
    description:
      'Two minutes: rent, czynsz, utilities and deposit for your building. Shown only as aggregates with their counts.',
  },
  pl: {
    title: 'Dodaj koszty swojego mieszkania w Warszawie',
    description:
      'Dwie minuty: czynsz najmu, czynsz administracyjny, media i kaucja w Twoim budynku. Pokazujemy je tylko zbiorczo, z liczbą raportów.',
  },
  ru: {
    title: 'Добавить расходы на свою квартиру в Варшаве',
    description:
      'Две минуты: аренда, чинш, коммуналка и залог по вашему дому. Показываем только сводные данные с числом отчётов.',
  },
  uk: {
    title: 'Додати витрати на свою квартиру у Варшаві',
    description:
      'Дві хвилини: оренда, чинш, комуналка і застава у вашому будинку. Показуємо лише зведені дані з кількістю звітів.',
  },
};

describe('submit page metadata', () => {
  it.each(Object.keys(EXPECTED) as Locale[])(
    '%s: its own title and description, and the existing alternates',
    async (locale) => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ locale, city: 'warsaw' }),
        searchParams: Promise.resolve({}),
      });

      expect(metadata).toEqual({
        ...EXPECTED[locale],
        alternates: getAlternates('/warsaw/costs/submit', locale),
      });
      expect([...EXPECTED[locale].description].length).toBeLessThanOrEqual(160);
    },
  );
});
