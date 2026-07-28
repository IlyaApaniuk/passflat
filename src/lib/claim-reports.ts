import { prisma } from '@/lib/prisma';
import { trackServerEvent } from '@/lib/posthog-server';
import { classifyRef } from '@/lib/referral';
import { readAnonId } from '@/lib/anon-id';
import { ANON_AUTHOR_ID } from '@/lib/import-constants';
import { syncHasContributedCost } from '@/lib/contribution';

/**
 * Claim cost reports submitted anonymously from this browser and attach them to
 * `userId`. Runs on first login from any auth path (email-confirm/OAuth callback
 * and password sign-in), so a visitor who submitted before creating an account
 * gets their report — and the contributor unlock — on whichever path they use.
 *
 * Mirrors the `importedEmail` claim in the auth callback: re-points the report's
 * author, stamps `claimedAt`, clears `anonymousId` (so the same browser logging
 * into a different account can't re-claim it), and re-derives
 * `hasContributedCost` from the reports the user now owns.
 * Fires `referred_contribution` when this is the user's first contribution and
 * they were referred — the attribution signal that matters for growth.
 *
 * Best-effort and self-contained: never throws into the auth flow.
 */
export async function claimAnonymousReports(userId: string): Promise<void> {
  try {
    const anonId = await readAnonId();
    if (!anonId) return;

    // Snapshot before the claim flips hasContributedCost, so a referred user's
    // FIRST contribution can be told apart from a repeat one.
    const profileBefore = await prisma.profile.findUnique({
      where: { id: userId },
      select: { hasContributedCost: true, referredBy: true },
    });

    const claimed = await prisma.costReport.updateMany({
      where: { anonymousId: anonId, authorId: ANON_AUTHOR_ID, claimedAt: null },
      data: { authorId: userId, claimedAt: new Date(), anonymousId: null },
    });
    if (claimed.count === 0) return;

    // Derived, not assumed: a claimed report that is flagged or hidden does not
    // make its new owner a contributor.
    const hasContributed = await syncHasContributedCost(userId);

    trackServerEvent(userId, 'anonymous_cost_reports_claimed', { count: claimed.count });

    if (
      hasContributed &&
      profileBefore &&
      !profileBefore.hasContributedCost &&
      profileBefore.referredBy
    ) {
      trackServerEvent(userId, 'referred_contribution', {
        referred_by: profileBefore.referredBy,
        referral_type: classifyRef(profileBefore.referredBy),
      });
    }
  } catch (err) {
    console.error('[claim] failed to claim anonymous cost reports', err);
  }
}
