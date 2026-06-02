'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { PRICES_PLN } from '@/lib/pricing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { Clock, ShoppingCart, Loader2 } from 'lucide-react';

const TIERS = [
  { days: 7, price: PRICES_PLN.COST_ACCESS_7 },
  { days: 30, price: PRICES_PLN.COST_ACCESS_30 },
  { days: 90, price: PRICES_PLN.COST_ACCESS_90 },
] as const;

interface BuyAccessDialogProps {
  citySlug: string;
  children: React.ReactNode;
}

export function BuyAccessDialog({ citySlug, children }: BuyAccessDialogProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const posthog = usePostHog();
  const [loadingTier, setLoadingTier] = useState<number | null>(null);

  async function handleBuy(tierDays: number) {
    setLoadingTier(tierDays);
    posthog?.capture('checkout_initiated', {
      productType: 'cost_access',
      tierDays,
      city: citySlug,
    });
    try {
      const res = await fetch('/api/checkout/cost-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierDays, locale }),
      });

      if (res.status === 401) {
        router.push(`/auth/login?next=${pathname}` as never);
        return;
      }

      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setLoadingTier(null);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('costs.buyAccess.title')}</DialogTitle>
          <DialogDescription>{t('costs.buyAccess.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {TIERS.map((tier) => (
            <button
              key={tier.days}
              onClick={() => handleBuy(tier.days)}
              disabled={loadingTier !== null}
              className="flex items-center justify-between rounded-lg border p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{t(`costs.buyAccess.tier${tier.days}`)}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('costs.buyAccess.priceFmt', { price: tier.price })}
                  </p>
                </div>
              </div>
              {loadingTier === tier.days ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <ShoppingCart className="h-5 w-5 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="border-t pt-3 text-center text-sm text-muted-foreground">
          {t('costs.buyAccess.orContribute')}{' '}
          <Link
            href={`/${citySlug}/costs/submit`}
            className="font-medium text-primary hover:underline"
          >
            {t('costs.buyAccess.contributeLink')}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
