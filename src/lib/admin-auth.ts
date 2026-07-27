import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isCostImportAdmin } from '@/lib/import-constants';

/**
 * Returns the authenticated user iff they are a moderation admin (their email is
 * in COST_IMPORT_ADMIN_EMAILS), else null. Single gate shared by the admin
 * moderation page and the admin API routes — defense in depth, both check.
 */
export async function getAdminUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isCostImportAdmin(user.email)) return null;
  return user;
}

/** Constant-time string compare; false (not a throw) on a length mismatch. */
function secretsMatch(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  // timingSafeEqual throws unless both buffers are the same length, so the
  // length check has to come first — it only leaks the header length, which the
  // caller supplied anyway.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Bearer gate shared by every /api/cron route (Vercel Cron sends the secret in
 * the Authorization header). Returns the response to send back, or null when the
 * request is authorized.
 *
 * Fails closed: an unset CRON_SECRET is a 500, never an open door. Comparing
 * against `Bearer ${undefined}` would otherwise let anyone who guesses
 * "Bearer undefined" trigger destructive crons (cleanup-accounts deletes
 * profiles, auth users and storage objects).
 */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set — refusing to run');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  if (!secretsMatch(authHeader, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
