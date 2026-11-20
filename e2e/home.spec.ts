import { expect, test } from '@playwright/test';

// A 44 px tap target (WCAG 2.5.5) measures as 43.99998 px in some layouts: sub-pixel rounding of
// the bounding box, not a smaller target. The tolerance keeps the check from failing on that.
const TAP_TARGET_PX = 43.9;

// Default locale is `pl` with `localePrefix: 'as-needed'`, so the Polish home
// page lives at `/` (no prefix) and the English one at `/en`.
test('home page (default locale) loads', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(400);

  // The document should render with a non-empty <title> and a visible <body>.
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator('body')).toBeVisible();
});

// PRD 4 FR-31 (spec 09 §HTTP headers): three security headers on every route, no framing
// header (Q-13, T154) and no Content-Security-Policy. A Polish browser stays on `/`.
test.describe('security headers on /', () => {
  test.use({ locale: 'pl-PL' });

  test('/ carries the three security headers and no framing header or CSP', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    const headers = response?.headers() ?? {};
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(headers['x-frame-options']).toBeUndefined();
    expect(headers['content-security-policy']).toBeUndefined();
  });
});

test('english home page (/en) loads', async ({ page }) => {
  const response = await page.goto('/en');
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
});

// PRD 4 FR-6 and FR-7 (D82): the home page, its footer included, no longer
// links to /replacement, /sublet or /create-listing; the hero chip, the thesis
// section's link (FR-9) and two ForWhom cards lead to the roommate page, and the
// district cards to the district pages.
test.describe('home framing on /en', () => {
  test.use({ locale: 'en-US' });

  test('no frozen listings link anywhere on the page, the footer included', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('footer')).toHaveCount(1);
    const frozen = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => /\/(replacement|sublet|create-listing)\b/.test(href)),
    );
    expect(frozen).toEqual([]);

    const main = page.locator('main');
    await expect(main.locator('a[href$="/warsaw/roommate"]')).toHaveCount(4);
    await expect(main.locator('a[href$="/warsaw/mokotow"]')).toHaveCount(1);
    await expect(main.locator('a[href*="/costs?district="]')).toHaveCount(0);
  });
});

// PRD 4 FR-9: right under the hero, a section headed by the thesis sentence
// ("Passflat helps people in Warsaw find someone to rent with ...") links to
// the roommate page. The e2e build sets no NEXT_PUBLIC_TELEGRAM_BOT_USERNAME, so
// the callout's bot button is absent there.
for (const [path, browserLocale, thesisStart] of [
  ['/', 'pl-PL', 'Passflat pomaga znaleźć w Warszawie'],
  ['/en', 'en-US', 'Passflat helps people in Warsaw'],
] as const) {
  test.describe(`thesis section on ${path}`, () => {
    test.use({ locale: browserLocale });

    test(`thesis section on ${path} links to the roommate page; no bot button (the e2e build has no bot username)`, async ({
      page,
    }) => {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
      // A section named by its own h2 (aria-labelledby) is a `region`; other home
      // sections hold h2s mentioning Passflat too, but carry no accessible name.
      const section = page.locator('main').getByRole('region', { name: /Passflat/ });
      await expect(section).toHaveCount(1);
      const heading = section.getByRole('heading', { level: 2 });
      await expect(heading).toHaveCount(1);
      await expect(heading).toContainText(thesisStart);
      await expect(section.locator('a[href$="/warsaw/roommate"]')).toHaveCount(1);
      await expect(section.locator('a[href*="t.me/"]')).toHaveCount(0);

      // Right under the hero: the first section after the hero's own section.
      const firstSections = await page.evaluate(() =>
        Array.from(document.querySelectorAll('main section'))
          .slice(0, 2)
          .map((element) => element.getAttribute('aria-labelledby')),
      );
      expect(firstSections[1]).toBe('flatmate-callout-home-title');
    });
  });
}

// PRD 4 FR-15: "how it works" opens on the roommate tab with the bot's steps
// (the cesja and sublet tabs follow until Q-3), and the FAQ's first question is
// the roommate one, opening onto its own answer.
test.describe('how it works and FAQ on /en', () => {
  test.use({ locale: 'en-US' });

  test('the roommate tab is first and selected; the FAQ starts with the roommate question', async ({
    page,
  }) => {
    await page.goto('/en');
    const main = page.locator('main');

    const tabs = main.locator('button[aria-pressed]');
    await expect(tabs).toHaveText(['Roommate Search', 'Lease Takeover', 'Temporary Sublet']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'false');
    const firstStep = main.getByRole('heading', { level: 3, name: 'Create a profile in the bot' });
    await expect(firstStep).toBeVisible();
    await expect(
      main.getByRole('heading', { level: 3, name: 'Contacts open on mutual interest' }),
    ).toBeVisible();

    // The other tabs still switch the steps.
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'false');
    await expect(firstStep).toHaveCount(0);

    const question = 'How do I find someone to rent with?';
    const triggers = main.locator('[data-slot="accordion-trigger"]');
    await expect(triggers.first()).toHaveText(question);
    await triggers.first().click();
    await expect(main.getByRole('region', { name: question })).toContainText(
      'Open the Passflat bot in Telegram and create a short profile',
    );
  });
});

// PRD 4 FR-34 (spec 09 §Contrast, tap targets and the hamburger): on a phone the
// hamburger is a named 44 px toggle that reports and controls the menu panel, and
// the mobile pill is 44 px tall. The bar keeps its height (T155 measured 58 px
// at 320 - 1023 px with py-1.5 below lg).
test.describe('mobile header on /en', () => {
  test.use({ locale: 'en-US', viewport: { width: 375, height: 800 } });

  test('the hamburger toggles #mobile-menu with aria-expanded; 44 px targets', async ({ page }) => {
    await page.goto('/en');
    const header = page.locator('header');
    const menu = header.getByRole('button', { name: 'Menu' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toHaveAttribute('aria-controls', 'mobile-menu');
    await expect(menu).toHaveAttribute('type', 'button');
    await expect(page.locator('#mobile-menu')).toHaveCount(0);

    const box = await menu.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(TAP_TARGET_PX);
    expect(box?.height).toBeGreaterThanOrEqual(TAP_TARGET_PX);
    const pill = await header.locator('a[href$="/warsaw/roommate"] button').boundingBox();
    expect(pill?.height).toBeGreaterThanOrEqual(TAP_TARGET_PX);
    const bar = await header.locator(':scope > div > div').first().boundingBox();
    expect(Math.round(bar?.height ?? 0)).toBe(58);

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    const panel = page.locator('#mobile-menu');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Find a flatmate' })).toBeVisible();
    for (const code of ['PL', 'EN', 'RU', 'UK']) {
      const language = await panel.getByRole('button', { name: code, exact: true }).boundingBox();
      expect(language?.height, code).toBeGreaterThanOrEqual(TAP_TARGET_PX);
    }

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#mobile-menu')).toHaveCount(0);
  });
});

// PRD 4 FR-5: "Find a flatmate" leads the header nav (desktop viewport, so the
// first match is the nav link, not the mobile pill); building reviews left it.
// Locale detection follows Accept-Language, so each case pins the browser
// locale: a Polish browser stays on `/`, an English one would be sent to `/en`.
for (const [path, browserLocale, label] of [
  ['/', 'pl-PL', 'Szukam współlokatora'],
  ['/en', 'en-US', 'Find a flatmate'],
] as const) {
  test.describe(`header on ${path}`, () => {
    test.use({ locale: browserLocale });

    test(`header links to the roommate page on ${path}`, async ({ page }) => {
      await page.goto(path);
      expect(new URL(page.url()).pathname).toBe(path);
      const header = page.locator('header');
      const roommate = header.locator('a[href$="/warsaw/roommate"]').first();
      await expect(roommate).toBeVisible();
      await expect(roommate).toHaveText(label);
      await expect(header.locator('a[href$="/warsaw/review"]')).toHaveCount(0);
    });
  });
}
