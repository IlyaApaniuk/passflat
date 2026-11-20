import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, unknown>,
  ]),
) as Record<Locale, Record<string, unknown>>;

const h = vi.hoisted(() => ({
  locale: 'en' as 'pl' | 'en' | 'ru' | 'uk',
  deleteMany: vi.fn(),
  profileUpdateMany: vi.fn(),
}));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  return {
    setRequestLocale: vi.fn(),
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: h.locale,
        messages: messages[h.locale] as never,
        namespace: namespace as never,
      }),
  };
});
vi.mock('@/lib/prisma', () => ({
  prisma: {
    cityNotifySubscription: { deleteMany: h.deleteMany },
    profile: { updateMany: h.profileUpdateMany },
  },
}));
vi.mock('@/components/landing/footer', () => ({ Footer: () => null }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

import { makeInterestRemovalToken, makeUnsubscribeToken } from '@/lib/email/unsubscribe';
import RemoveInterestPage, { dynamic, metadata } from './page';

const ROW_ID = '4b6f2a1e-9c3d-4e8f-a7b2-1c0d9e8f7a6b';

type RemoveInterestCopy = {
  successTitle: string;
  successDesc: string;
  errorTitle: string;
  errorDesc: string;
};
const copy = (locale: Locale) =>
  (messages[locale].unsubscribe as { removeInterest: RemoveInterestCopy }).removeInterest;

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function renderPage(token: string | undefined, locale: Locale = 'en') {
  h.locale = locale;
  const page = (await RemoveInterestPage({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve(token === undefined ? {} : { token }),
  })) as ReactElement;
  return text(renderToStaticMarkup(page));
}

describe('remove-interest page (spec 02 §Remove-interest link)', () => {
  beforeEach(() => {
    vi.stubEnv('CRON_SECRET', 'test-cron-secret');
    h.deleteMany.mockReset().mockResolvedValue({ count: 1 });
    h.profileUpdateMany.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is dynamic and never indexed', () => {
    expect(dynamic).toBe('force-dynamic');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it('deletes exactly that listings-interest row for a valid token and shows success', async () => {
    const page = await renderPage(makeInterestRemovalToken(ROW_ID));

    expect(h.deleteMany).toHaveBeenCalledTimes(1);
    expect(h.deleteMany).toHaveBeenCalledWith({
      where: { id: ROW_ID, listingType: { not: '' } },
    });
    expect(page).toContain(copy('en').successTitle);
    expect(page).toContain(copy('en').successDesc);
    expect(page).not.toContain(copy('en').errorTitle);
    expect(h.profileUpdateMany).not.toHaveBeenCalled();
  });

  it('shows the error text when the row is already gone', async () => {
    h.deleteMany.mockResolvedValueOnce({ count: 0 });
    const page = await renderPage(makeInterestRemovalToken(ROW_ID));

    expect(h.deleteMany).toHaveBeenCalledTimes(1);
    expect(page).toContain(copy('en').errorTitle);
    expect(page).toContain(copy('en').errorDesc);
    expect(page).not.toContain(copy('en').successTitle);
  });

  it.each([
    ['no token', undefined],
    ['a malformed token', 'garbage'],
    ['a tampered token', `${ROW_ID}.${'A'.repeat(43)}`],
  ])('deletes nothing and shows the error text for %s', async (_label, token) => {
    const page = await renderPage(token);

    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(page).toContain(copy('en').errorTitle);
  });

  it('does not accept a profile unsubscribe token for the same id', async () => {
    const page = await renderPage(makeUnsubscribeToken(ROW_ID));

    expect(h.deleteMany).not.toHaveBeenCalled();
    expect(h.profileUpdateMany).not.toHaveBeenCalled();
    expect(page).toContain(copy('en').errorTitle);
  });

  it.each(LOCALES)('renders both states with no raw key in %s', async (locale) => {
    const success = await renderPage(makeInterestRemovalToken(ROW_ID), locale);
    expect(success).toContain(copy(locale).successTitle);
    expect(success).toContain(copy(locale).successDesc);

    const error = await renderPage('garbage', locale);
    expect(error).toContain(copy(locale).errorTitle);
    expect(error).toContain(copy(locale).errorDesc);

    for (const page of [success, error]) {
      expect(page).not.toMatch(/removeInterest|unsubscribe\./);
      expect(page).toContain((messages[locale].unsubscribe as { home: string }).home);
    }
  });
});
