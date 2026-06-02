import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resolves the `@/*` path alias from tsconfig.json.
  plugins: [tsconfigPaths()],
  test: {
    // Pure logic is the focus; switch individual files to jsdom via a
    // `// @vitest-environment jsdom` docblock when a component test needs it.
    environment: 'node',
    globals: true,
    // SITE_URL (src/lib/site-url.ts) reads NEXT_PUBLIC_APP_URL. Pin it here so
    // SEO/canonical-URL specs assert against a stable production-like origin.
    env: { NEXT_PUBLIC_APP_URL: 'https://passflat.com' },
    // Only pick up unit/integration specs under src/. Playwright specs live in
    // e2e/ and must NOT be run by Vitest.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', 'playwright-report', 'test-results'],
  },
});
