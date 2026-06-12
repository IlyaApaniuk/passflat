'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { format, type Locale } from 'date-fns';
import { enUS, pl, ru, uk } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  List,
  Mail,
  Pencil,
  RefreshCw,
} from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { BuyAccessDialog } from '@/components/costs/buy-access-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const DATE_LOCALE_MAP: Record<string, Locale> = { en: enUS, pl, ru, uk };

export interface CostAccess {
  hasContributedData: boolean;
  costAccessUntil: string | null;
  isFlagged: boolean;
}

interface CostAccessCardProps {
  /** `null` while the streamed auth promise is still resolving. */
  access: CostAccess | null;
  citySlug: string;
}

type Tone = 'primary' | 'accent' | 'destructive';

const TONE: Record<Tone, { card: string; badge: string }> = {
  primary: { card: 'border-primary/50 bg-primary/5', badge: 'bg-primary/10 text-primary' },
  accent: { card: 'border-accent/50 bg-accent/5', badge: 'bg-accent/10 text-accent' },
  destructive: {
    card: 'border-destructive/50 bg-destructive/5',
    badge: 'bg-destructive/10 text-destructive',
  },
};

/** Centered card frame shared by every access state. */
function Shell({
  tone,
  icon,
  title,
  desc,
  children,
}: {
  tone: Tone;
  icon: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={`${TONE[tone].card} gap-0 py-0`}>
      <CardContent className="flex flex-col items-center px-4 py-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE[tone].badge}`}
          >
            {icon}
          </span>
          <p className="font-semibold">{title}</p>
        </div>
        {desc && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{desc}</p>}
        {children && (
          <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Single source of truth for the "your access" affordance on the costs page.
 * Renders every access state — pending / flagged / paid-active / contributed /
 * locked / expired — in one centered card with a stable footprint, so it swaps
 * content without the buttons jumping when auth resolves.
 */
export function CostAccessCard({ access, citySlug }: CostAccessCardProps) {
  const t = useTranslations();
  const posthog = usePostHog();
  const locale = useLocale();
  const dateFmtLocale = DATE_LOCALE_MAP[locale] ?? enUS;

  const fmtDate = (iso: string) => format(new Date(iso), 'PP', { locale: dateFmtLocale });

  // Pending: mirror the locked card footprint (badge, title, two buttons) so
  // the resolved state lands in the same place — no layout jump.
  if (access === null) {
    return (
      <Card className="gap-0 py-0" aria-hidden="true">
        <CardContent className="flex flex-col items-center px-4 py-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <Skeleton className="h-7 w-7 rounded-full" />
            <Skeleton className="h-5 w-44" />
          </div>
          <Skeleton className="mt-1.5 h-4 w-56 max-w-full" />
          <div className="mt-3 flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-center">
            <Skeleton className="h-8 w-full sm:w-44" />
            <Skeleton className="h-8 w-full sm:w-36" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const { hasContributedData, costAccessUntil, isFlagged } = access;
  const now = new Date();
  const paidValid = !!costAccessUntil && new Date(costAccessUntil) > now;
  const paidActive = !hasContributedData && paidValid;

  // Flagged report — pending moderation.
  if (isFlagged) {
    return (
      <Shell
        tone="destructive"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={t('costs.overview.flaggedTitle')}
        desc={t('costs.overview.flaggedDesc')}
      >
        <Button size="sm" asChild>
          <Link href={{ pathname: '/dashboard', query: { tab: 'costs' } }}>
            <List className="mr-1.5 h-4 w-4" />
            {t('costs.overview.myReports')}
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={'/contact?subject=costs' as '/'}>
            <Mail className="mr-1.5 h-4 w-4" />
            {t('costs.submit.contactUs')}
          </Link>
        </Button>
      </Shell>
    );
  }

  // Paid access still active.
  if (paidActive) {
    return (
      <Shell
        tone="accent"
        icon={<CalendarClock className="h-4 w-4" />}
        title={t('costs.access.activeUntil', { date: fmtDate(costAccessUntil!) })}
      >
        <BuyAccessDialog citySlug={citySlug}>
          <Button size="sm" variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {t('costs.access.renew')}
          </Button>
        </BuyAccessDialog>
      </Shell>
    );
  }

  // Unlocked by contributing a report.
  if (hasContributedData) {
    return (
      <Shell
        tone="accent"
        icon={<CheckCircle2 className="h-4 w-4" />}
        title={t('costs.access.unlockedTitle')}
        desc={t('costs.access.unlockedDesc')}
      >
        <Button size="sm" variant="outline" className="gap-2" asChild>
          <Link href={{ pathname: '/dashboard', query: { tab: 'costs' } }}>
            <List className="h-4 w-4" />
            {t('costs.overview.myReports')}
          </Link>
        </Button>
      </Shell>
    );
  }

  // Cost data is open to everyone — no lock/buy CTA. Nudge a contribution so the
  // dataset keeps growing and stays fresh for the next tenant. Payments are
  // dormant; a buy/unlock path can be reinstated later.
  return (
    <Shell
      tone="accent"
      icon={<CheckCircle2 className="h-4 w-4" />}
      title={t('costs.access.openTitle')}
      desc={t('costs.access.openDesc')}
    >
      <Button asChild>
        <Link
          href={`/${citySlug}/costs/submit`}
          onClick={() =>
            posthog?.capture('cost_submit_cta_clicked', { source: 'access_card', state: 'open' })
          }
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          {t('costs.overview.submitMyCosts')}
        </Link>
      </Button>
    </Shell>
  );
}
