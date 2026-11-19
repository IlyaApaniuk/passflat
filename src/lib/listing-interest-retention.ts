import { subMonths } from 'date-fns';

import { prisma } from '@/lib/prisma';

/**
 * Listings-interest rows are `city_notify_subscriptions` rows with a non-empty
 * `listingType` (roommate, replacement or sublet interest). They are kept for this
 * many months, counted from `createdAt`, the first save: a later re-save does not
 * extend it, because the table has no `updatedAt` (spec 02 §Listings-interest
 * retention, D31). City-launch rows (`listingType = ''`) are never deleted here.
 */
export const LISTING_INTEREST_RETENTION_MONTHS = 12;

/** Rows created before this moment are past the retention period. */
export function listingInterestCutoff(now: Date): Date {
  return subMonths(now, LISTING_INTEREST_RETENTION_MONTHS);
}

/** Deletes every listings-interest row past the retention period; returns the count. */
export async function deleteExpiredListingInterest(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.cityNotifySubscription.deleteMany({
    where: {
      listingType: { not: '' },
      createdAt: { lt: listingInterestCutoff(now) },
    },
  });
  return count;
}
