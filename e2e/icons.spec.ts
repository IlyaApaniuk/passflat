import { expect, test } from '@playwright/test';

// FR-30 (spec 09 §Icons and the locale guard): browsers ask for `/favicon.ico` and
// `/apple-touch-icon.png` on their own. Both used to reach the `[locale]` segment and answer 500;
// two static route handlers now serve PNGs of the brand mark, and the locale layout's metadata
// guard answers other dotted paths with 404. An unknown path without a dot reaches `[city]`,
// which returns 500 in this database-less build, so it is not asserted here.

/** Width and height from the PNG's IHDR chunk (bytes 16 – 23, big-endian). */
function pngSize(body: Buffer): { width: number; height: number } {
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

for (const { path, size } of [
  { path: '/favicon.ico', size: 48 },
  { path: '/apple-touch-icon.png', size: 180 },
]) {
  test(`${path} answers 200 with a ${size} × ${size} PNG`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
    expect(response.headers()['cache-control']).toBe('public, max-age=86400, s-maxage=604800');
    expect(pngSize(await response.body())).toEqual({ width: size, height: size });
  });
}

test('an unknown dotted path answers 404, not 500', async ({ request }) => {
  const response = await request.get('/nonexistent.ext', { maxRedirects: 0 });
  expect(response.status()).toBe(404);
});
