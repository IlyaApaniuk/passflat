import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeforeSendFn, CaptureResult, PostHog, PostHogConfig } from 'posthog-js';
import { CONSENT_KEY } from '@/lib/consent';

// A double of the posthog-js surface `initPostHog` uses. Never a real key or request.
const ph = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
}));
vi.mock('posthog-js', () => ({ default: ph }));

import { initPostHog } from './posthog-client';

function stubBrowser(pathname: string, consent: string | null = null) {
  vi.stubGlobal('window', {
    location: { pathname },
    localStorage: { getItem: (key: string) => (key === CONSENT_KEY ? consent : null) },
  });
}

function initConfig(): Partial<PostHogConfig> {
  expect(ph.init).toHaveBeenCalledTimes(1);
  return ph.init.mock.calls[0][1] as Partial<PostHogConfig>;
}

beforeEach(() => {
  ph.__loaded = false;
  ph.init.mockReset();
  ph.init.mockImplementation(() => {
    ph.__loaded = true;
    return ph;
  });
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('initPostHog', () => {
  it('does nothing without NEXT_PUBLIC_POSTHOG_KEY', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    stubBrowser('/');
    expect(initPostHog()).toBe(false);
    expect(ph.init).not.toHaveBeenCalled();
  });

  it('does nothing on the server', () => {
    expect(initPostHog()).toBe(false);
    expect(ph.init).not.toHaveBeenCalled();
  });

  it('initialises once, with the memory store before any consent answer', () => {
    stubBrowser('/');
    expect(initPostHog()).toBe(true);
    expect(initPostHog()).toBe(true);

    expect(ph.init.mock.calls[0][0]).toBe('phc_test_key');
    expect(initConfig()).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      capture_pageview: false,
      capture_pageleave: true,
      persistence: 'memory',
      disable_surveys: true,
      opt_out_capturing_by_default: false,
      disable_session_recording: true,
    });
  });

  it('uses localStorage+cookie after an accept and the memory store after a decline (D10)', () => {
    stubBrowser('/', 'accepted');
    initPostHog();
    expect(initConfig()).toMatchObject({
      persistence: 'localStorage+cookie',
      disable_surveys: false,
    });

    ph.__loaded = false;
    ph.init.mockClear();
    stubBrowser('/', 'declined');
    initPostHog();
    expect(initConfig()).toMatchObject({ persistence: 'memory', disable_surveys: true });
  });

  it('sends to NEXT_PUBLIC_POSTHOG_HOST when it is set', () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://ph.example.test');
    stubBrowser('/');
    initPostHog();
    expect(initConfig().api_host).toBe('https://ph.example.test');
  });

  it('attaches the page context of T005 to every event in before_send', () => {
    stubBrowser('/ru/warsaw/building/marszalkowska-1');
    initPostHog();
    const beforeSend = initConfig().before_send as BeforeSendFn;

    const event: CaptureResult = {
      uuid: 'event-1',
      event: 'building_detail_viewed',
      properties: { $session_id: 'session-1', building_id: 'b1', city: 'warsaw' },
    };
    expect(beforeSend(event)?.properties).toMatchObject({
      page_type: 'building',
      locale: 'ru',
      city: 'warsaw',
      entry_page_type: 'building',
      building_id: 'b1',
    });
    expect(beforeSend(null)).toBeNull();
  });

  it('clears a stale opt-out flag in the memory mode and fetches the flags once loaded', () => {
    stubBrowser('/');
    initPostHog();
    const loaded = initConfig().loaded!;
    const client = {
      debug: vi.fn(),
      has_opted_out_capturing: vi.fn(() => true),
      clear_opt_in_out_capturing: vi.fn(),
      reloadFeatureFlags: vi.fn(),
    };

    loaded(client as unknown as PostHog);

    expect(client.clear_opt_in_out_capturing).toHaveBeenCalledTimes(1);
    expect(client.reloadFeatureFlags).toHaveBeenCalledTimes(1);
    expect(client.debug).not.toHaveBeenCalled();
  });

  it('logs an init that throws and lets the page render without analytics', () => {
    stubBrowser('/');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ph.init.mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => initPostHog()).not.toThrow();
    expect(initPostHog()).toBe(false);
    expect(error).toHaveBeenCalledWith('[posthog] init failed:', 'blocked');
  });
});
