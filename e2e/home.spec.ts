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
