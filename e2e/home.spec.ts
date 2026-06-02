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
