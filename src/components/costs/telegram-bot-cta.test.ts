import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { capture } = vi.hoisted(() => ({ capture: vi.fn() }));

// The hooks are mocked, so the component can be called as a plain function and its element
// inspected without a DOM.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'pl',
}));
vi.mock('posthog-js/react', () => ({ usePostHog: () => ({ capture }) }));

import { TelegramBotCta } from './telegram-bot-cta';

type LinkProps = { href: string; target: string; rel: string; onClick: () => void };

function renderLink(props: Parameters<typeof TelegramBotCta>[0]) {
  return TelegramBotCta(props) as ReactElement<LinkProps> | null;
}

describe('TelegramBotCta', () => {
  beforeEach(() => {
    capture.mockClear();
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
