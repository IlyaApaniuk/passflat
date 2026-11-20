import { defineConfig, devices } from '@playwright/test';

// The e2e server runs on its own port and build directory so it never touches
// the owner's dev server (port 3000, `.next`). Agents use ports 3100–3199.
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const DIST_DIR = '.next-e2e';

/**
 * A fake PostHog host: `e2e/posthog-landing.spec.ts` answers every request to it with
 * `page.route`, and `.invalid` never resolves, so no request reaches PostHog. The key next
 * to it is a dummy, never a real project key.
 */
export const E2E_POSTHOG_HOST = 'https://posthog.e2e.invalid';

// Inert dummy env so `next start` can boot in CI without real services. Mirrors
// the build env in .github/workflows/ci.yml. Real values would be wired via
// GitHub secrets / a test environment if e2e ever needs to hit a live backend.
const dummyEnv: Record<string, string> = {
  DATABASE_URL: 'postgresql://user:password@localhost:5432/passflat',
  DIRECT_URL: 'postgresql://user:password@localhost:5432/passflat',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'dummy-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'dummy-service-role-key',
  STRIPE_SECRET_KEY: 'sk_test_dummy',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
  STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
  STRIPE_PRICE_EXTRA_LISTING: 'price_dummy',
  STRIPE_PRICE_PROMOTE_7: 'price_dummy',
  STRIPE_PRICE_PROMOTE_14: 'price_dummy',
  STRIPE_PRICE_PROMOTE_30: 'price_dummy',
  STRIPE_PRICE_COST_ACCESS_7: 'price_dummy',
  STRIPE_PRICE_COST_ACCESS_30: 'price_dummy',
  STRIPE_PRICE_COST_ACCESS_90: 'price_dummy',
  RESEND_API_KEY: 're_dummy',
  CRON_SECRET: 'dummy-cron-secret',
  NEXT_PUBLIC_APP_URL: baseURL,
  NEXT_PUBLIC_FEATURE_DOCUMENT_TEMPLATES: 'true',
  // posthog-js runs for real in the e2e build (landing capture, spec 01 FR-13).
  NEXT_PUBLIC_POSTHOG_KEY: 'phc_e2e_dummy_key',
  NEXT_PUBLIC_POSTHOG_HOST: E2E_POSTHOG_HOST,
  // Read by next.config.mjs as `distDir` for both `next build` and `next start`.
  NEXT_DIST_DIR: DIST_DIR,
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    // Never test a server this run did not start: a busy port fails the run.
    reuseExistingServer: false,
    timeout: 180_000,
    env: dummyEnv,
  },
});
