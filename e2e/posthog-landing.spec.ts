import { gunzipSync } from 'node:zlib';
import { expect, test, type Page, type Request } from '@playwright/test';
import { E2E_POSTHOG_HOST } from '../playwright.config';

// Landing capture (spec 01 §Landing capture, FR-13). The e2e build runs with a dummy
// PostHog key whose host is fake (`playwright.config.ts`), so the real posthog-js runs in a
// real browser while every request it makes is answered here and nothing leaves the
// machine. posthog-js drops a `capture` made before `posthog.init` and, in debug mode, logs
// "You must initialize PostHog before calling posthog.capture": that loss is what these
// tests guard against. Before the fix (init in the provider's own effect, which runs after
// its children's effects) the login page lost `auth_started` and a page that failed to
// render lost its landing `$pageview`.

interface SentEvent {
  event: string;
  properties: Record<string, unknown>;
}

const EVENT_PATH = /^\/(?:e|i\/v0\/e|batch)\/?$/;

/** The events of one PostHog request body: gzip, base64 form or plain JSON, batch or single. */
function decodeEvents(request: Request): SentEvent[] {
  const raw = request.postDataBuffer();
  if (!raw || raw.length === 0) return [];
  let text: string;
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    text = gunzipSync(raw).toString('utf8');
  } else {
    text = raw.toString('utf8');
    if (text.startsWith('data=')) {
      text = Buffer.from(decodeURIComponent(text.slice('data='.length)), 'base64').toString('utf8');
    }
  }
  const parsed: unknown = JSON.parse(text);
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && 'batch' in parsed
      ? (parsed as { batch: unknown[] }).batch
      : [parsed];
  return list as SentEvent[];
}

interface Recorder {
  events: SentEvent[];
  /** posthog-js warnings about a call made before `posthog.init`. */
  uninitialized: string[];
}

/**
 * Answers every request to the fake PostHog host and records the events it receives.
 * posthog-js treats `navigator.webdriver` (true under Playwright) and a headless brand as a
 * bot and drops every event, so the page sees an ordinary browser. `POSTHOG_DEBUG` only
 * turns on posthog-js console logging; it stores nothing.
 */
async function recordPostHog(page: Page): Promise<Recorder> {
  const recorder: Recorder = { events: [], uninitialized: [] };
  page.on('console', (message) => {
    if (message.text().includes('You must initialize PostHog')) {
      recorder.uninitialized.push(message.text());
    }
  });
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
    (window as unknown as { POSTHOG_DEBUG: boolean }).POSTHOG_DEBUG = true;
  });
  await page.route(`${E2E_POSTHOG_HOST}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'POST' && EVENT_PATH.test(pathname)) {
      recorder.events.push(...decodeEvents(request));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  return recorder;
}

const named = (events: SentEvent[], name: string) => events.filter((e) => e.event === name);

/** posthog-js flushes its queue every 3 s; this outlasts one flush. */
const FLUSH_WAIT_MS = 4_000;

/** Waits until `name` has arrived, then one more flush, and returns every `name` sent. */
async function settled(page: Page, recorder: Recorder, name: string, atLeast = 1) {
  await expect
    .poll(() => named(recorder.events, name).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(atLeast);
  await page.waitForTimeout(FLUSH_WAIT_MS);
  return named(recorder.events, name);
}

test('the landing $pageview reaches PostHog once, with page context', async ({ page, baseURL }) => {
  const recorder = await recordPostHog(page);
  await page.goto('/en');

  const pageviews = await settled(page, recorder, '$pageview');
  expect(pageviews).toHaveLength(1);
  expect(pageviews[0].properties).toMatchObject({
    $current_url: `${baseURL}/en`,
    page_type: 'home',
    entry_page_type: 'home',
    locale: 'en',
    city: null,
  });
  expect(recorder.uninitialized).toEqual([]);

  // Memory persistence until consent (D10): nothing of PostHog's on the device.
  const stored = await page.evaluate(() => ({
    keys: Object.keys(window.localStorage),
    cookies: document.cookie,
  }));
  expect(stored.keys.filter((key) => key.startsWith('ph_'))).toEqual([]);
  expect(stored.cookies).not.toContain('ph_');
});

test('a mount-time capture on the landing page is not dropped', async ({ page }) => {
  const recorder = await recordPostHog(page);
  await page.goto('/en/auth/login');

  const started = await settled(page, recorder, 'auth_started');
  expect(started).toHaveLength(1);
  expect(started[0].properties).toMatchObject({ method: 'login', page_type: 'other' });
  expect(named(recorder.events, '$pageview')).toHaveLength(1);
  expect(recorder.uninitialized).toEqual([]);
});

test('a page that fails to render still sends its landing $pageview', async ({ page, baseURL }) => {
  const recorder = await recordPostHog(page);
  // An unknown first segment is read as a city: 404 with a database, 500 without one (e2e).
  const response = await page.goto('/en/no-such-page-e2e');
  expect(response?.status()).toBeGreaterThanOrEqual(400);

  const pageviews = await settled(page, recorder, '$pageview');
  expect(pageviews.map((e) => e.properties.$current_url)).toEqual([
    `${baseURL}/en/no-such-page-e2e`,
  ]);
  expect(recorder.uninitialized).toEqual([]);
});

test('a client-side navigation adds exactly one $pageview', async ({ page, baseURL }) => {
  const recorder = await recordPostHog(page);
  await page.goto('/en');
  await settled(page, recorder, '$pageview');

  await page.locator('footer a[href="/en/about"]').first().click();
  await page.waitForURL('**/en/about');

  const pageviews = await settled(page, recorder, '$pageview', 2);
  expect(pageviews.map((e) => e.properties.$current_url)).toEqual([
    `${baseURL}/en`,
    `${baseURL}/en/about`,
  ]);
  // One session across the client navigation; the entry stays the landing page.
  expect(pageviews[1].properties.$session_id).toBe(pageviews[0].properties.$session_id);
  expect(pageviews[1].properties).toMatchObject({ page_type: 'other', entry_page_type: 'home' });
});
