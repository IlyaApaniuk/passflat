import { describe, expect, it, vi } from 'vitest';

// The plugin only wires next-intl's request config into the build; the headers are the app's own.
vi.mock('next-intl/plugin', () => ({ default: () => (config: unknown) => config }));

import nextConfig from '../next.config.mjs';

const FRAMING_POLICY = "frame-ancestors 'self' https://eu.posthog.com";

// FR-31 (spec 09 §HTTP headers): three security headers on every route, plus the framing header
// (D90, Q-13 (b), T154) as a Content-Security-Policy with `frame-ancestors` as its only directive
// and no X-Frame-Options. e2e/home.spec.ts checks them on `/` of the built server.
describe('next.config headers()', () => {
  it('sends exactly the three security headers and the framing policy on every route', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy', value: FRAMING_POLICY },
        ],
      },
    ]);
  });

  it('frames only from this site and the PostHog EU app host, with one CSP directive', async () => {
    const headers = ((await nextConfig.headers?.()) ?? []).flatMap((rule) => rule.headers);
    const csp = headers.filter((header) => header.key.toLowerCase() === 'content-security-policy');
    expect(csp).toHaveLength(1);
    const directives = csp[0].value
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean);
    expect(directives).toEqual([FRAMING_POLICY]);
  });

  it('sets no X-Frame-Options, which would also block the PostHog frames', async () => {
    const keys = ((await nextConfig.headers?.()) ?? []).flatMap((rule) =>
      rule.headers.map((header) => header.key.toLowerCase()),
    );
    expect(keys).not.toContain('x-frame-options');
  });
});
