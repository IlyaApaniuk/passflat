'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Bell, CheckCircle2, Send, ArrowRight, Plus } from 'lucide-react';
import type { ListingType } from '@/lib/listings-data';

/**
 * Demand-capture for the empty listings state, organised as two intents:
 *   1. "Looking for a place?" → district-scoped notify waitlist (logged-in users
 *      get a one-tap subscribe; logged-out get the email form).
 *   2. "Renting out / passing on?" → post your own listing (supply hook).
 * Plus a subtle footer link into the open cost-data product. Honesty: we only
 * promise to email "when they appear" — no fake counts.
 */
export function ListingsEmptyState({
  citySlug,
  listingType,
  selectedDistrict,
  districtSlug,
  isLoggedIn,
}: {
  citySlug: string;
  /** District display name (already translated from nameKey), or undefined for whole-city. */
  selectedDistrict?: string;
  /** District.slug, or '' when no district is selected. */
  districtSlug: string;
  listingType: ListingType;
  /** Logged-in users get a one-tap subscribe (email resolved from their session). */
  isLoggedIn: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const posthog = usePostHog();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  useEffect(() => {
    posthog?.capture('district_waitlist_viewed', {
      city: citySlug,
      districtSlug,
      listingType,
      results_count: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subscribe = async (withEmail: string | undefined) => {
    setStatus('loading');
    try {
      const res = await fetch('/api/city-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(withEmail ? { email: withEmail } : {}),
          city: citySlug,
          districtSlug,
          listingType,
          consent: true,
          locale,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus('success');
      setEmail('');
      setConsent(false);
      setConsentError(false);
    } catch {
      setStatus('error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!consent) {
      setConsentError(true);
      return;
    }
    void subscribe(email);
  };

  const title = selectedDistrict
    ? t('listings.demandCapture.titleWithDistrict', { district: selectedDistrict })
    : t('listings.demandCapture.title');

  const privacyLink = (chunks: React.ReactNode) => (
    <Link href="/privacy" className="text-primary hover:underline">
      {chunks}
    </Link>
  );

  const postOwnHref = isLoggedIn
    ? { pathname: '/create-listing' as const, query: { type: listingType } }
    : {
        pathname: '/auth/login' as const,
        query: { next: `/${locale}/create-listing?type=${listingType}` },
      };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>

      <div className="space-y-3 text-left">
        {/* Demand — looking for a place */}
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">{t('listings.demandCapture.searchCardTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              isLoggedIn
                ? 'listings.demandCapture.subtitleLoggedIn'
                : 'listings.demandCapture.subtitle',
            )}
          </p>

          {status === 'success' ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="font-medium">{t('landing.cityNotify.success')}</span>
            </div>
          ) : isLoggedIn ? (
            <div className="mt-3 space-y-2">
              <Button
                onClick={() => void subscribe(undefined)}
                disabled={status === 'loading'}
                className="h-11 w-full"
              >
                <Bell className="mr-2 h-4 w-4" />
                {t('listings.demandCapture.notifyMeButton')}
              </Button>
              {status === 'error' && (
                <p className="text-xs text-destructive">{t('landing.cityNotify.error')}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t.rich('listings.demandCapture.consentNote', { privacyLink })}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-3 space-y-3">
              <Input
                type="email"
                required
                placeholder={t('landing.cityNotify.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
              <div className="flex items-start gap-2">
                <Checkbox
                  id="waitlist-consent"
                  checked={consent}
                  onCheckedChange={(c) => {
                    setConsent(c === true);
                    if (c) setConsentError(false);
                  }}
                  aria-invalid={consentError}
                  className="mt-0.5"
                />
                <Label
                  htmlFor="waitlist-consent"
                  className="text-xs font-normal leading-snug text-muted-foreground"
                >
                  {t('landing.cityNotify.consent')}
                </Label>
              </div>
              {consentError && (
                <p className="text-xs text-destructive">
                  {t('landing.cityNotify.consentRequired')}
                </p>
              )}
              <Button
                type="submit"
                disabled={status === 'loading' || !consent}
                className="h-11 w-full"
              >
                <Send className="mr-2 h-4 w-4" />
                {t('listings.demandCapture.notifyMeButton')}
              </Button>
              {status === 'error' && (
                <p className="text-xs text-destructive">{t('landing.cityNotify.error')}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t.rich('landing.cityNotify.privacyNote', { privacyLink })}
              </p>
            </form>
          )}
        </div>

        {/* Supply — have a place to offer */}
        <div className="rounded-xl border bg-card p-4">
          <p className="font-semibold">{t('listings.demandCapture.supplyCardTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('listings.demandCapture.supplyCardBody')}
          </p>
          <Button variant="outline" className="mt-3 w-full" asChild>
            <Link
              href={postOwnHref}
              onClick={() =>
                posthog?.capture('listing_create_cta_clicked', {
                  source: 'listings_empty_state',
                  city: citySlug,
                  listingType,
                  is_anonymous: !isLoggedIn,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              {t('listings.demandCapture.postOwnButton')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Cost data — subtle footer link */}
      <div className="mt-4 text-center">
        <Button
          variant="link"
          className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
          asChild
        >
          <Link
            href={`/${citySlug}/costs`}
            onClick={() =>
              posthog?.capture('cost_data_cta_clicked', {
                source: 'listings_empty_state',
                city: citySlug,
                districtSlug,
              })
            }
          >
            {t('listings.demandCapture.costCtaTitle')}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
