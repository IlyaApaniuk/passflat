import { initPostHog } from '@/lib/analytics/posthog-client';

// Next.js runs this file once per full page load, after the HTML has loaded and before React
// hydrates. PostHog is initialised here so that every capture a component issues while the
// first page mounts (the landing `$pageview`, `building_detail_viewed`, `auth_started`, ...)
// runs after `posthog.init` (spec 01 §Landing capture, FR-13).
initPostHog();
