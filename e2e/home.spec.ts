import { expect, test } from '@playwright/test';

// Default locale is `pl` with `localePrefix: 'as-needed'`, so the Polish home
// page lives at `/` (no prefix) and the English one at `/en`.
test('home page (default locale) loads', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBeLessThan(400);

  // The document should render with a non-empty <title> and a visible <body>.
  await expect(page).toHaveTitle(/.+/);
  await expect(page.locator('body')).toBeVisible();
});

test('english home page (/en) loads', async ({ page }) => {
  const response = await page.goto('/en');
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator('body')).toBeVisible();
});

// PRD 4 FR-6: outside the footer (its frozen links wait for FR-7, Q-5), the
// home page no longer links to /replacement, /sublet or /create-listing; the
// hero chip and two ForWhom cards lead to the roommate page, and the district
// cards to the district pages.
test.describe('home framing on /en', () => {
  test.use({ locale: 'en-US' });

  test('no frozen listings link outside the footer', async ({ page }) => {
    await page.goto('/en');
    const frozen = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => !a.closest('footer'))
        .map((a) => a.getAttribute('href') ?? '')
        .filter((href) => /\/(replacement|sublet|create-listing)\b/.test(href)),
    );
    expect(frozen).toEqual([]);

    const main = page.locator('main');
    await expect(main.locator('a[href$="/warsaw/roommate"]')).toHaveCount(3);
    await expect(main.locator('a[href$="/warsaw/mokotow"]')).toHaveCount(1);
    await expect(main.locator('a[href*="/costs?district="]')).toHaveCount(0);
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
