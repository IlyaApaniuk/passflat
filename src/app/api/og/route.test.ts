import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from './route';

// FR-31 (spec 09 §HTTP headers): a rendered card is cached by browsers, the CDN and link-preview
// crawlers; e2e/og-image.spec.ts checks the same header on the built server.
describe('/api/og cache header', () => {
  it('a rendered card carries the link-preview Cache-Control', async () => {
    const response = await GET(new NextRequest('https://passflat.com/api/og?title=Mokot%C3%B3w'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  });
});
