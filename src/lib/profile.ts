import type { User } from '@supabase/supabase-js';
import { prisma } from '@/lib/prisma';

/**
 * Guarantees a `profiles` row exists for an authenticated Supabase user.
 *
 * Profiles were historically created only in the `/auth/callback` route, so any
 * session established without it (password login, cross-browser PKCE confirm in
 * a webview, etc.) left an authenticated user without a profile and broke every
 * write that FKs to `profiles` (e.g. cost_reports_author_id_fkey). Calling this
 * at the point of use makes profile creation idempotent and browser-agnostic.
 */
export async function getOrCreateProfile(user: User, locale?: string) {
  const defaultCity = await prisma.city.findUnique({
    where: { slug: 'warsaw' },
    select: { id: true },
  });

  // Pure "ensure exists": an existing row (even soft-deleted) already satisfies
  // the FK, and recovery of a soft-deleted account stays the job of the explicit
  // /api/account/recover flow rather than a silent side effect of login.
  return prisma.profile.upsert({
    where: { id: user.id },
    create: {
      id: user.id,
      email: user.email ?? null,
      displayName: user.user_metadata?.full_name || user.email?.split('@')[0] || null,
      locale: locale ?? null,
      cityId: defaultCity?.id,
    },
    update: { email: user.email ?? null },
  });
}
