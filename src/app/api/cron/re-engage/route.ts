import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail } from '@/lib/email/send';
import { localeUrl } from '@/lib/email/url';
import { makeUnsubscribeToken } from '@/lib/email/unsubscribe';
import { resolveEmailLocale } from '@/lib/email/types';
import { requireCronAuth } from '@/lib/admin-auth';

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_MS = 30.44 * DAY_MS;

// Trigger B knobs: only prompt once a contributor's newest report is a year old,
// and at most ~twice a year, capped per run so a backlog can't blast everyone.
const REFRESH_AFTER_MONTHS = 12;
const REENGAGE_COOLDOWN_DAYS = 180;
const REFRESH_BATCH = 200;

/**
 * Re-engagement cron — the freshness loop that turns one-off contributors into
 * returning users. Two independent triggers:
 *   A. Followed buildings with new reports → "N new reports in <building>".
 *   B. A contributor whose newest report is a year+ old → "refresh your report".
 * Bearer-authenticated like the other crons; scheduled weekly in vercel.json.
 */
export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const now = new Date();
  let activitySent = 0;
  let activityFailed = 0;
  let refreshSent = 0;
  let refreshFailed = 0;

  // ── Trigger A: new reports in buildings the user follows ───────────────────
  // Low-volume loop (one count per follow); fine at current scale, mirrors the
  // per-row style of the expiring-listings cron.
  const follows = await prisma.buildingFollow.findMany({
    where: { user: { emailsOptOut: false } },
    select: {
      id: true,
      userId: true,
      buildingId: true,
      createdAt: true,
      lastNotifiedAt: true,
      user: { select: { email: true, locale: true } },
      building: {
        select: { addressFull: true, slug: true, city: { select: { slug: true } } },
      },
    },
  });

  for (const follow of follows) {
    const email = follow.user?.email;
    if (!email) continue;

    // "New" = visible reports by *other* tenants since we last notified this
    // follower (or since they started following). Their own report doesn't count.
    const since = follow.lastNotifiedAt ?? follow.createdAt;
    const [newReports, totalReports] = await Promise.all([
      prisma.costReport.count({
        where: {
          buildingId: follow.buildingId,
          isVisible: true,
          authorId: { not: follow.userId },
          createdAt: { gt: since },
        },
      }),
      prisma.costReport.count({
        where: { buildingId: follow.buildingId, isVisible: true },
      }),
    ]);
    if (newReports === 0) continue;

    // Reserve the notification *before* sending so a crash after Resend accepts
    // the email can't re-notify next run (duplicates read as spam). Trade-off is
    // at-most-once: a rare hard send failure (after sendEmail's own retries)
    // skips this batch and the follower catches the next new report instead.
    await prisma.buildingFollow.update({
      where: { id: follow.id },
      data: { lastNotifiedAt: now },
    });

    const locale = resolveEmailLocale(follow.user?.locale);
    const citySlug = follow.building.city?.slug || 'warsaw';
    const result = await sendEmail({
      to: email,
      locale,
      template: 'buildingActivity',
      data: {
        buildingAddress: follow.building.addressFull,
        newReports,
        totalReports,
        buildingUrl: localeUrl(locale, `/${citySlug}/building/${follow.building.slug}`),
        unsubscribeUrl: localeUrl(
          locale,
          `/email/unsubscribe?token=${makeUnsubscribeToken(follow.userId)}`,
        ),
      },
    });

    if (!result.success) {
      activityFailed += 1;
      continue;
    }
    activitySent += 1;
  }

  // ── Trigger B: contributors whose newest report has gone stale ─────────────
  const refreshCutoff = new Date(now.getTime() - REFRESH_AFTER_MONTHS * MONTH_MS);
  const cooldownCutoff = new Date(now.getTime() - REENGAGE_COOLDOWN_DAYS * DAY_MS);

  const staleAuthors = await prisma.profile.findMany({
    where: {
      email: { not: null },
      deletedAt: null,
      emailsOptOut: false,
      OR: [{ lastReengagementAt: null }, { lastReengagementAt: { lt: cooldownCutoff } }],
      // Has a visible report, but none is still fresh → their newest has gone
      // stale. Freshness = confirmedAt ?? createdAt (a re-confirm bumps it).
      costReports: {
        some: { isVisible: true },
        none: {
          isVisible: true,
          OR: [
            { confirmedAt: { gte: refreshCutoff } },
            { confirmedAt: null, createdAt: { gte: refreshCutoff } },
          ],
        },
      },
    },
    select: {
      id: true,
      email: true,
      locale: true,
      costReports: {
        where: { isVisible: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          id: true,
          createdAt: true,
          confirmedAt: true,
          building: {
            select: { addressFull: true, slug: true, city: { select: { slug: true } } },
          },
        },
      },
    },
    take: REFRESH_BATCH,
  });

  for (const author of staleAuthors) {
    const email = author.email;
    const report = author.costReports[0];
    if (!email || !report) continue;

    // Reserve before send (see Trigger A): a duplicate is worse than a rare miss
    // for a twice-a-year nudge, and the cooldown already gates re-tries.
    await prisma.profile.update({
      where: { id: author.id },
      data: { lastReengagementAt: now },
    });

    const locale = resolveEmailLocale(author.locale);
    const citySlug = report.building.city?.slug || 'warsaw';
    const freshAt = report.confirmedAt ?? report.createdAt;
    const monthsAgo = Math.max(
      REFRESH_AFTER_MONTHS,
      Math.round((now.getTime() - freshAt.getTime()) / MONTH_MS),
    );

    const result = await sendEmail({
      to: email,
      locale,
      template: 'costReportRefresh',
      data: {
        buildingAddress: report.building.addressFull,
        monthsAgo,
        // Deep-link into edit mode for *this* report so the form prefills and
        // submits a PATCH (update) instead of creating a duplicate.
        submitUrl: localeUrl(locale, `/${citySlug}/costs/submit?edit=true&id=${report.id}`),
        unsubscribeUrl: localeUrl(
          locale,
          `/email/unsubscribe?token=${makeUnsubscribeToken(author.id)}`,
        ),
      },
    });

    if (!result.success) {
      refreshFailed += 1;
      continue;
    }
    refreshSent += 1;
  }

  return NextResponse.json({
    success: true,
    activity: { follows: follows.length, sent: activitySent, failed: activityFailed },
    // `capped` flags that more stale authors may remain for the next run.
    refresh: {
      candidates: staleAuthors.length,
      sent: refreshSent,
      failed: refreshFailed,
      capped: staleAuthors.length === REFRESH_BATCH,
    },
    timestamp: now.toISOString(),
  });
}
