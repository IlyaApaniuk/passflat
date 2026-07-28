import { prisma } from '@/lib/prisma';

export type ContributionState = {
  /** The user owns at least one publicly visible cost report. */
  hasContributed: boolean;
  /** Nothing visible, but something of theirs was flagged and hidden. */
  isFlagged: boolean;
};

/**
 * The single definition of "this user has contributed cost data": they own at
 * least one VISIBLE report.
 *
 * Narrower definitions used to disagree with each other — the flag state of the
 * one report just edited, or an unordered `findFirst` — so a user with three
 * good reports could lose access to one bad edit, and the same account could
 * resolve differently from one request to the next.
 */
export async function getContributionState(userId: string): Promise<ContributionState> {
  const [visibleCount, flaggedCount] = await Promise.all([
    prisma.costReport.count({ where: { authorId: userId, isVisible: true } }),
    prisma.costReport.count({
      where: { authorId: userId, isVisible: false, verificationStatus: 'flagged' },
    }),
  ]);

  return {
    hasContributed: visibleCount > 0,
    // Only worth telling the user about when nothing else of theirs is live.
    isFlagged: visibleCount === 0 && flaggedCount > 0,
  };
}

/**
 * Re-derive `profile.hasContributedCost` from the reports and persist it, so the
 * denormalized flag can't drift from the definition above.
 */
export async function syncHasContributedCost(userId: string): Promise<boolean> {
  const { hasContributed } = await getContributionState(userId);

  await prisma.profile.update({
    where: { id: userId },
    data: { hasContributedCost: hasContributed },
  });

  return hasContributed;
}
