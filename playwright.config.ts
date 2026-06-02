import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

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
    command: 'npm run build && npm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: dummyEnv,
  },
});
