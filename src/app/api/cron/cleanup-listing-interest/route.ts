import { NextRequest, NextResponse } from 'next/server';

import { requireCronAuth } from '@/lib/admin-auth';
import { deleteExpiredListingInterest } from '@/lib/listing-interest-retention';

/**
 * Daily: deletes listings-interest e-mails (waitlist rows with a listing type)
 * saved more than 12 months ago. City-launch rows are kept. Logs and returns only
 * the count, never an address. Bearer-authenticated like the other crons;
 * scheduled in vercel.json.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const deletedCount = await deleteExpiredListingInterest();
  console.info(`[cron] cleanup-listing-interest deleted ${deletedCount} rows`);
  return NextResponse.json({ deletedCount });
}
