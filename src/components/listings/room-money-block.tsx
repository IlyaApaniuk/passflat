'use client';

import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import { AreaReferenceGroups } from '@/components/buildings/figure-group-block';
import { Link } from '@/i18n/navigation';
import type { AreaReference } from '@/lib/cost-figures';

/** The block's figures: the city's room reference and its name in the visitor's locale. */
export interface RoomMoneyFigures {
  reference: AreaReference;
  areaName: string;
}

/**
 * The checklist, in order (spec 02 §Room money block, **Assumption**, agent draft); the fifth
 * item, the address check, is a link. Flat keys: the roommate page's namespace check reads a
 * dotted key under a scoped translator as a namespace.
 */
const CHECKLIST = [
  'checklistSee',
  'checklistReservation',
  'checklistIncludes',
  'checklistProtocol',
] as const;

/**
 * **Assumption** (spec 02 §Room money block): where to look for rooms in Warsaw, each link
 * naming its site. No event: E11 counts the address check, not links out.
 */
const ROOM_SEARCH_LINKS = [
  { key: 'linkOlx', href: 'https://www.olx.pl/nieruchomosci/stancje-pokoje/warszawa/' },
  {
    key: 'linkOtodom',
    href: 'https://www.otodom.pl/pl/wyniki/wynajem/pokoj/mazowieckie/warszawa/warszawa/warszawa',
  },
  { key: 'linkFacebook', href: 'https://www.facebook.com/search/groups/?q=pokoje%20warszawa' },
] as const;

/**
 * "Found a room? What it will cost you per person, and is it safe to pay the deposit?" on
 * `/warsaw/roommate` (spec 02 §Room money block, PRD 3 FR-22): the city's room figures as the
 * checker renders an area reference (both groups with their N and labels, nothing the figure
 * contract did not produce; no figures → no figures line), a five-item checklist whose last
 * item is the address check (`cost_data_cta_clicked {source: 'roommate_bridge'}`, the same
 * event as the bridge line it replaces while the block shows), and links out to room search
 * sites. Its keys live in `listings`, which the route receives.
 */
export function RoomMoneyBlock({
  figures,
  citySlug,
}: {
  figures: RoomMoneyFigures | null;
  citySlug: string;
}) {
  const t = useTranslations('listings.roomMoney');
  const posthog = usePostHog();

  return (
    <section
      aria-labelledby="room-money-title"
      className="mb-4 space-y-3 rounded-lg border bg-primary/5 p-4 text-sm"
    >
      <h2 id="room-money-title" className="text-base font-semibold">
        {t('title')}
      </h2>

      {figures && (
        <div className="space-y-3">
          <p className="text-muted-foreground">{t('figuresLead')}</p>
          <AreaReferenceGroups
            reference={figures.reference}
            area={figures.areaName}
            oneObservationLabel={t('oneObservation')}
          />
        </div>
      )}

      <div>
        <p className="font-medium">{t('checklistTitle')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {CHECKLIST.map((item) => (
            <li key={item}>{t(item)}</li>
          ))}
          <li>
            <Link
              href={`/${citySlug}/check`}
              onClick={() =>
                posthog?.capture('cost_data_cta_clicked', {
                  source: 'roommate_bridge',
                  city: citySlug,
                })
              }
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('checklistAddress')}
            </Link>
          </li>
        </ul>
      </div>

      <div>
        <p className="font-medium">{t('linksTitle')}</p>
        <ul className="mt-1 space-y-1">
          {ROOM_SEARCH_LINKS.map((link) => (
            <li key={link.key}>
              <a
                href={link.href}
                target="_blank"
                rel="nofollow noopener"
                className="inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                {t(link.key)}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
