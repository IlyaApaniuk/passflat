import { expect, test } from '@playwright/test';

// The cost share card (`/api/og`, edge) renders the single number with its group label and N
// (spec 03 §Single-number surfaces, T053). It needs no database, so the e2e build serves it.
test('the cost OG card renders with a figure label', async ({ request }) => {
  const params = new URLSearchParams({
    title: 'Mokotów',
    subtitle: 'Warszawa',
    stat: '≈ 3,700 zł',
    statLabel: 'Median Monthly Total',
    figureLabel: 'Asking prices (5), known part',
    split: 'Rent ≈ 3,000 · Expenses ≈ 700',
  });
  const response = await request.get(`/api/og?${params.toString()}`);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('image/png');
  // FR-31 (spec 09 §HTTP headers): link previews are cached.
  expect(response.headers()['cache-control']).toBe(
    'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
  );
  expect((await response.body()).byteLength).toBeGreaterThan(1000);
});
