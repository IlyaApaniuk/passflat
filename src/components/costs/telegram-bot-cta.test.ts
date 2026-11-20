import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const LOCALES = ['pl', 'en', 'ru', 'uk'] as const;
type Locale = (typeof LOCALES)[number];

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/i18n/messages', `${locale}.json`), 'utf8'),
    ) as Record<string, Record<string, unknown>>,
  ]),
) as Record<Locale, Record<string, Record<string, unknown>>>;

const { capture, state } = vi.hoisted(() => ({
  capture: vi.fn(),
  state: { locale: 'pl' as 'pl' | 'en' | 'ru' | 'uk' },
}));

// The hooks are mocked, so the component can be called as a plain function and its element
// inspected without a DOM. The translator is the real ICU one over the `checker` namespace
// only (what the checker's scoped provider serves); a missing key throws.
vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  return {
    ...actual,
    useTranslations: (namespace: string) =>
      actual.createTranslator({
        locale: state.locale,
        messages: { checker: messages[state.locale].checker } as never,
        namespace: namespace as never,
        onError: (error) => {
          throw error;
        },
      }),
    useLocale: () => state.locale,
  };
});
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));

import { TelegramBotCta, TelegramBotHint } from './telegram-bot-cta';

type LinkProps = {
  href: string;
  target: string;
  rel: string;
  className: string;
  onClick: () => void;
};

function renderLink(props: Parameters<typeof TelegramBotCta>[0]) {
  return TelegramBotCta(props) as ReactElement<LinkProps> | null;
}

function text(html: string) {
  return html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
}

function checkerCosts(locale: Locale) {
  return messages[locale].checker.costs as Record<string, string>;
}

describe('TelegramBotCta', () => {
  beforeEach(() => {
    capture.mockClear();
    state.locale = 'pl';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders nothing without NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    expect(renderLink({ buildingId: 'bld_1', source: 'checker' })).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });

  it('keeps the link as before: deep link with the building payload in a new tab', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    const link = renderLink({ buildingId: 'bld_1', source: 'checker' });
    expect(link?.type).toBe('a');
    expect(link?.props.href).toBe('https://t.me/passflat_test_bot?start=b_bld_1');
    expect(link?.props.target).toBe('_blank');
    expect(link?.props.rel).toBe('noopener noreferrer');
  });

  it('is an outline button at least 44 px high whose label may wrap (FR-14)', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    const className = renderLink({ buildingId: 'bld_1', source: 'checker' })?.props.className;
    expect(className).toBe(
      cn(buttonVariants({ variant: 'outline' }), 'mt-4 h-auto min-h-11 whitespace-normal'),
    );
    const classes = className?.split(' ') ?? [];
    // The outline variant's own classes, and the overrides tailwind-merge keeps.
    for (const expected of ['border', 'bg-background', 'min-h-11', 'h-auto', 'whitespace-normal']) {
      expect(classes).toContain(expected);
    }
    // The fixed default height and the no-wrap rule are replaced, not stacked.
    expect(classes).not.toContain('h-9');
    expect(classes).not.toContain('whitespace-nowrap');
  });

  it.each(LOCALES)('%s: keeps the checker.costs.telegramCta label', (locale) => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    state.locale = locale;
    const html = renderToStaticMarkup(
      createElement(TelegramBotCta, { buildingId: 'bld_1', source: 'checker' }),
    );
    expect(text(html)).toBe(checkerCosts(locale).telegramCta);
    expect(html).toContain('href="https://t.me/passflat_test_bot?start=b_bld_1"');
  });

  it('uses the web_<source> payload without a building', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    const link = renderLink({ source: 'empty' });
    expect(link?.props.href).toBe('https://t.me/passflat_test_bot?start=web_empty');
    expect(renderLink({ source: 'checker' })?.props.href).toBe(
      'https://t.me/passflat_test_bot?start=web_checker',
    );
  });

  it('takes its payload from botStartPayload (roommate → mate_web_roommate)', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    expect(renderLink({ source: 'roommate' })?.props.href).toBe(
      'https://t.me/passflat_test_bot?start=mate_web_roommate',
    );
  });

  it('fires one telegram_bot_opened per click with source and building context', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    const link = renderLink({ buildingId: 'bld_1', source: 'empty' });
    expect(capture).not.toHaveBeenCalled();

    link?.props.onClick();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith('telegram_bot_opened', {
      source: 'empty',
      has_building_context: true,
    });

    link?.props.onClick();
    expect(capture).toHaveBeenCalledTimes(2);
  });

  it('reports no building context for a link without a building', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    renderLink({ source: 'checker' })?.props.onClick();
    expect(capture).toHaveBeenCalledWith('telegram_bot_opened', {
      source: 'checker',
      has_building_context: false,
    });
  });
});

describe('TelegramBotHint', () => {
  beforeEach(() => {
    capture.mockClear();
    state.locale = 'en';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('renders nothing without NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', '');
    expect(TelegramBotHint()).toBeNull();
    expect(renderToStaticMarkup(createElement(TelegramBotHint))).toBe('');
  });

  it('is a plain muted line with no link and no click handler', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    const hint = TelegramBotHint() as ReactElement<{ className: string; onClick?: unknown }>;
    expect(hint.type).toBe('p');
    expect(hint.props.className).toBe('mt-2 text-sm text-muted-foreground');
    expect(hint.props.onClick).toBeUndefined();
    expect(renderToStaticMarkup(createElement(TelegramBotHint))).not.toContain('<a');
    expect(capture).not.toHaveBeenCalled();
  });

  it('shows the PRD 4 §8 sentence in English', () => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    expect(text(renderToStaticMarkup(createElement(TelegramBotHint)))).toBe(
      "This building's figures and roommate profiles in Telegram, in English, Russian and " +
        'Ukrainian; the deposit letter in Russian and Ukrainian.',
    );
  });

  it.each(LOCALES)('%s: renders checker.costs.telegramHint, naming Telegram', (locale) => {
    vi.stubEnv('NEXT_PUBLIC_TELEGRAM_BOT_USERNAME', 'passflat_test_bot');
    state.locale = locale;
    const shown = text(renderToStaticMarkup(createElement(TelegramBotHint)));
    expect(shown).toBe(checkerCosts(locale).telegramHint);
    expect(shown).toMatch(/Telegram/);
  });
});
