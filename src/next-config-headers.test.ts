import { describe, expect, it, vi } from 'vitest';

// The plugin only wires next-intl's request config into the build; the headers are the app's own.
vi.mock('next-intl/plugin', () => ({ default: () => (config: unknown) => config }));

import nextConfig from '../next.config.mjs';

// FR-31 (spec 09 §HTTP headers): three security headers on every route, no framing header (Q-13,
// T154) and no Content-Security-Policy. e2e/home.spec.ts checks them on `/` of the built server.
describe('next.config headers()', () => {
  it('sends exactly the three security headers on every route', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]);
  });

  it('sets no framing header and no Content-Security-Policy', async () => {
    const keys = ((await nextConfig.headers?.()) ?? []).flatMap((rule) =>
      rule.headers.map((header) => header.key.toLowerCase()),
    );
    expect(keys).not.toContain('x-frame-options');
    expect(keys).not.toContain('content-security-policy');
  });
});
