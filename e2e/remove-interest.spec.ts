import { expect, test } from '@playwright/test';

// Spec 02 §Remove-interest link. The e2e build has no database, so only the invalid-token
// path is exercised here: it must render the error text without touching Prisma, and the
// page must stay out of search indexes. The valid-token delete is covered by Vitest.
test('remove-interest page rejects an invalid token and is noindex', async ({ page }) => {
  const response = await page.goto('/en/email/remove-interest?token=not-a-valid-token');
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Link invalid or already used');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
