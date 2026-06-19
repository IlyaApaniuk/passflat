'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Bell, CheckCircle2, Send, ArrowRight } from 'lucide-react';
import type { ListingType } from '@/lib/listings-data';

/**
 * Demand-capture for the empty listings state. Real search traffic lands on the
 * listings pages with no supply yet, so instead of a dead end we (1) collect a
 * district-scoped "notify me when listings appear" waitlist (reuses the
 * city-notify form + endpoint) and (2) route the demand to the open cost-data
 * product. Honesty: we only promise to email "when they appear" — no fake counts.
 */
export function ListingsEmptyState({
  citySlug,
  listingType,
  selectedDistrict,
  districtSlug,
}: {
  citySlug: string;
  /** District display name (already translated from nameKey), or undefined for whole-city. */
  selectedDistrict?: string;
  /** District.slug, or '' when no district is selected. */
  districtSlug: string;
  listingType: ListingType;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    if (!consent) {
      setConsentError(true);
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch('/api/city-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
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

  const title = selectedDistrict
    ? t('listings.demandCapture.titleWithDistrict', { district: selectedDistrict })
    : t('listings.demandCapture.title');

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Bell className="h-7 w-7 text-primary" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground">{t('listings.demandCapture.subtitle')}</p>

      {status === 'success' ? (
        <div className="mt-6 flex w-full flex-col items-center gap-2 rounded-xl border bg-muted/40 p-5">
          <CheckCircle2 className="h-7 w-7 text-primary" />
          <p className="font-medium">{t('landing.cityNotify.success')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 w-full space-y-3 text-left">
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
            <p className="text-xs text-destructive">{t('landing.cityNotify.consentRequired')}</p>
          )}
          <Button type="submit" disabled={status === 'loading' || !consent} className="h-11 w-full">
            <Send className="mr-2 h-4 w-4" />
            {t('landing.cityNotify.submit')}
          </Button>
          {status === 'error' && (
            <p className="text-xs text-destructive">{t('landing.cityNotify.error')}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {t.rich('landing.cityNotify.privacyNote', {
              privacyLink: (chunks) => (
                <Link href="/privacy" className="text-primary hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </form>
      )}

      {/* Route the demand to the cost-data product while they wait. */}
      <div className="mt-8 w-full border-t pt-6">
        <p className="text-sm font-medium">{t('listings.demandCapture.costCtaTitle')}</p>
        <Button variant="outline" className="mt-3 w-full" asChild>
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
            {t('listings.demandCapture.costCtaButton')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
