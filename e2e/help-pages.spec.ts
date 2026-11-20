import { expect, test } from '@playwright/test';

// PRD 4 FR-16 (spec 08 §How it works, Help and About; D80, "nothing is paid today"):
// the Help page has no payments section and answers "Is Passflat free?" with "free
// today"; /how-it-works keeps only the seekers and costs tabs. These pages render
// without a database, so they are checked in the real build.
test.describe('Help and how-it-works pages on /en (FR-16)', () => {
  test.use({ locale: 'en-US' });

  test('Help: no payments section, "free today", no price on the page', async ({ page }) => {
    await page.goto('/en/help');
    const main = page.locator('main');

    await expect(main.getByRole('heading', { level: 2, name: 'General' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Payments & Refunds' })).toHaveCount(0);
    await expect(main.getByText('Can I promote my listing?')).toHaveCount(0);

    await main.getByRole('button', { name: 'Is Passflat free?' }).click();
    await expect(main.getByRole('region', { name: 'Is Passflat free?' })).toHaveText(
      'Yes. Everything on Passflat is free today: the figures, the address check, the calculator, the guides, the templates and the Telegram bot.',
    );

    const text = await main.innerText();
    expect(text).not.toMatch(/PLN|zł/);
  });

  test('how it works: the seekers and costs tabs, no listers tab', async ({ page }) => {
    await page.goto('/en/how-it-works');
    const main = page.locator('main');

    const tabs = main.locator('button[aria-pressed]');
    await expect(tabs).toHaveText(['Looking for a flat', 'Comparing costs']);
    await expect(tabs.nth(0)).toHaveAttribute('aria-pressed', 'true');
    await expect(main.getByText('Passing on a lease', { exact: true })).toHaveCount(0);

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(
      main.getByRole('heading', { level: 2, name: "Know what it'll cost before you sign" }),
    ).toBeVisible();
  });
});
