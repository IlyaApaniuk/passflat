type AnyMessages = Record<string, unknown>;

/**
 * Return a shallow copy of `messages` containing only the given top-level
 * namespaces. Used to shrink the JSON catalog that gets serialized into the
 * client bundle via `NextIntlClientProvider` — server components keep using the
 * full catalog through `getTranslations`.
 */
export function pickMessages<T extends AnyMessages>(messages: T, namespaces: readonly string[]): T {
  const result: AnyMessages = {};
  for (const ns of namespaces) {
    if (ns in messages) {
      result[ns] = messages[ns];
    }
  }
  return result as T;
}

/**
 * Namespaces required by client components that can render on (nearly) every
 * route through the shared locale layout — i.e. the `<Header>`, the landing
 * page islands, listing/cost/chat/dashboard/auth client components and the
 * route error boundary.
 *
 * Intentionally EXCLUDED here and provided via a scoped `NextIntlClientProvider`
 * on their own (single) page instead:
 *   - `privacy`, `termsPage`, `helpCenter`, `howItWorksPage`, `about`
 *     (large, content-heavy namespaces used by exactly one isolated page each).
 *
 * Also excluded because they are only ever read by server code:
 *   - `meta`, `emails`, `cookieConsent` (CookieConsent ships its own strings),
 *     `breadcrumbs`, `city`.
 *
 * This list is verified against every `useTranslations(...)` consumer in the
 * codebase — keep it in sync if a client component starts using a new
 * top-level namespace.
 */
export const SHARED_CLIENT_NAMESPACES = [
  'common',
  'landing',
  'listings',
  'costs',
  'chat',
  'errors',
  'auth',
  'account',
  'dashboard',
  'documents',
  'blog',
  'pricing',
  'contact',
  'interest',
  'favorites',
  'share',
  'upload',
  // Building tags are picked on the cost-submit thank-you screen, the review
  // page and the checker; ~35 short strings, so a scoped provider on each of
  // those surfaces would cost more plumbing than the bytes it saves.
  'buildingTags',
  'buildingTagPicker',
] as const;
