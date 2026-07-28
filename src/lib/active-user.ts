import { prisma } from '@/lib/prisma';

/**
 * Whether this account is soft-deleted.
 *
 * Account deletion is a 30-day soft delete (`Profile.deletedAt`) and the
 * session keeps working for that window — the middleware only bounces such a
 * user away from `/dashboard`, `/messages` and `/create-listing` page
 * navigations, which left every API route open to them (posting listings, cost
 * reports, messages, checkouts). Read through Prisma rather than PostgREST so
 * the check does not depend on an RLS policy being in place.
 */
export async function isAccountDeleted(userId: string): Promise<boolean> {
  const profile = await prisma.profile.findUnique({
    where: { id: userId },
    select: { deletedAt: true },
  });
  return !!profile?.deletedAt;
}

/** 403 body shared by the routes that refuse a soft-deleted account. */
export const ACCOUNT_DELETED_RESPONSE = { error: 'Account deleted', code: 'ACCOUNT_DELETED' };
