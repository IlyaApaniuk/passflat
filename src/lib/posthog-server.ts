import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;

  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com",
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

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
