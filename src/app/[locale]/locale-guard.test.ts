import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// FR-30 (spec 09 §Icons and the locale guard): a dotted path skips the middleware and reaches the
// `[locale]` segment as a "locale". The layout's metadata must answer it with a 404 before it reads
// translations (which read the request header and turned the 404 into a 500).

const { getTranslations, notFound } = vi.hoisted(() => ({
  getTranslations: vi.fn(async () => (key: string) => `meta.${key}`),
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
}));

vi.mock('next/navigation', () => ({ notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations,
  getMessages: vi.fn(),
  setRequestLocale: vi.fn(),
}));
vi.mock('next/font/google', () => ({
  Manrope: () => ({ variable: 'font-manrope' }),
  JetBrains_Mono: () => ({ variable: 'font-mono' }),
}));
vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }));
vi.mock('@vercel/speed-insights/next', () => ({ SpeedInsights: () => null }));
vi.mock('@/components/landing/header', () => ({ Header: () => null }));
vi.mock('@/components/providers/posthog-provider', () => ({ PostHogProvider: () => null }));
vi.mock('@/components/providers/google-analytics', () => ({ GoogleAnalytics: () => null }));
vi.mock('@/components/cookie-consent', () => ({ CookieConsent: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/publish-snackbar', () => ({ PublishSnackbar: () => null }));

import { generateMetadata } from './layout';
import { metadata as rootMetadata } from '../layout';

const params = (locale: string) => ({ params: Promise.resolve({ locale }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('locale layout generateMetadata', () => {
  it.each(['favicon.ico', 'apple-touch-icon.png', 'nonexistent.ext', 'xx'])(
    'answers %s with notFound() before reading translations',
    async (locale) => {
      await expect(generateMetadata(params(locale))).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK');
      expect(notFound).toHaveBeenCalledTimes(1);
      expect(getTranslations).not.toHaveBeenCalled();
    },
  );

  it.each(['pl', 'en', 'ru', 'uk'])('reads the meta copy for %s', async (locale) => {
    const metadata = await generateMetadata(params(locale));
    expect(notFound).not.toHaveBeenCalled();
    expect(getTranslations).toHaveBeenCalledWith('meta');
    expect(metadata.description).toBe('meta.homeDescription');
  });
});

describe('the home route /[locale]', () => {
  it('serves only the generated locales (an unknown one gets the router 404, no render)', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/[locale]/page.tsx'), 'utf8');
    expect(source).toMatch(/^export const dynamicParams = false;$/m);
  });
});

describe('root metadata icons', () => {
  it('keeps the SVG icon and names the PNG touch icon its route serves', () => {
    expect(rootMetadata.icons).toEqual({
      icon: { url: '/icon.svg', type: 'image/svg+xml' },
      apple: '/apple-touch-icon.png',
    });
  });
});
