import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogClient;
}

export function trackServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
) {
  const ph = getPostHogServer();
  if (!ph) return;

  ph.capture({
    distinctId,
    event,
    properties,
  });
}

/**
 * Server-side feature-flag check. Defaults to disabled (false) when PostHog is
 * not configured or the flag cannot be evaluated, so it acts as a fail-closed
 * kill-switch for paid features that must stay off until explicitly enabled.
 */
export async function isServerFeatureFlagEnabled(
  key: string,
  distinctId: string,
): Promise<boolean> {
  const ph = getPostHogServer();
  if (!ph) return false;

  try {
    const value = await ph.getFeatureFlag(key, distinctId);
    return value === true || value === 'true';
  } catch (err) {
    console.error('[posthog] getFeatureFlag failed:', err);
    return false;
  }
}

export function captureServerException(
  error: unknown,
  options?: { distinctId?: string; properties?: Record<string, unknown> },
) {
  const ph = getPostHogServer();
  if (!ph) return;

  try {
    ph.captureException(error, options?.distinctId, options?.properties);
  } catch (err) {
    console.error('[posthog] captureException failed:', err);
  }
}

export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>,
  setOnce?: Record<string, unknown>,
) {
  const ph = getPostHogServer();
  if (!ph) return;

  ph.identify({
    distinctId,
    properties,
    ...(setOnce ? { propertiesSetOnce: setOnce } : {}),
  });
}

/**
 * Awaits delivery of any buffered events. Call this at the end of a serverless
 * request (webhook, checkout route) so authoritative events are not lost when
 * the function is frozen/torn down. Unlike `shutdownPostHog`, it keeps the
 * singleton usable across warm invocations and never throws.
 */
export async function flushPostHog() {
  if (!posthogClient) return;
  try {
    await posthogClient.flush();
  } catch (err) {
    console.error('[posthog] flush failed:', err);
  }
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
