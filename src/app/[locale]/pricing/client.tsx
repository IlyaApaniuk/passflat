'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Link } from '@/i18n/navigation';
import {
  Check,
  Sparkles,
  Search,
  FileText,
  Heart,
  PlusCircle,
  TrendingUp,
  Eye,
  Award,
  ShieldCheck,
  Clock,
  BarChart3,
} from 'lucide-react';

const promotedTiers = [
  { days: 7, price: 39 },
  { days: 14, price: 59 },
  { days: 30, price: 89 },
] as const;

const costAccessTiers = [
  { days: 7, key: 'tier7' as const },
  { days: 30, key: 'tier30' as const },
  { days: 90, key: 'tier90' as const },
] as const;

export function PricingClient() {
  const t = useTranslations('pricing');

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
            {/* Free tier */}
            <Card className="relative overflow-hidden gap-0 py-0">
              <CardContent className="flex flex-1 flex-col p-8">
                <div className="mb-6">
                  <Badge variant="secondary" className="mb-4">
                    {t('free.badge')}
                  </Badge>
                  <h2 className="text-2xl font-bold">{t('free.title')}</h2>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">0</span>
                    <span className="text-lg text-muted-foreground">PLN</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{t('free.description')}</p>
                </div>

                <ul className="mb-8 space-y-3">
                  {[
                    { icon: Search, key: 'browsing' },
                    { icon: PlusCircle, key: 'posting' },
                    { icon: FileText, key: 'costReports' },
                    { icon: Heart, key: 'favorites' },
                  ].map(({ icon: Icon, key }) => (
                    <li key={key} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{t(`free.${key}`)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <Button asChild className="w-full">
                    <Link href="/create-listing">{t('free.cta')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Promoted tier */}
            <Card className="relative overflow-hidden gap-0 py-0 border-primary/50 shadow-lg">
              <div className="absolute right-0 top-0 rounded-bl-lg bg-primary px-3 py-1">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <CardContent className="flex flex-1 flex-col p-8">
                <div className="mb-6">
                  <Badge className="mb-4">{t('promoted.badge')}</Badge>
                  <h2 className="text-2xl font-bold">{t('promoted.title')}</h2>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-sm text-muted-foreground">{t('promoted.from')}</span>
                    <span className="text-4xl font-bold">39</span>
                    <span className="text-lg text-muted-foreground">PLN</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{t('promoted.description')}</p>
                </div>

                <ul className="mb-6 space-y-3">
                  {[
                    { icon: TrendingUp, key: 'topResults' },
                    { icon: Award, key: 'highlightedBadge' },
                    { icon: Eye, key: 'moreViews' },
                  ].map(({ icon: Icon, key }) => (
                    <li key={key} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{t(`promoted.${key}`)}</span>
                    </li>
                  ))}
                </ul>

                {/* Tier options */}
                <div className="mb-6 space-y-2">
                  {promotedTiers.map(({ days, price }) => (
                    <div
                      key={days}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                    >
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">
                          {t('promoted.days', { count: days })}
                        </span>
                      </div>
                      <span className="font-semibold">{price} PLN</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto">
                  <p className="mb-3 text-center text-xs text-muted-foreground">
                    {t('promoted.stripeNote')}
                  </p>

                  <Button asChild className="w-full">
                    <Link href="/create-listing">{t('promoted.cta')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Extra Listings + Cost Access */}
      <section className="border-t bg-muted/20 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-2">
            {/* Extra Listings */}
            <Card className="relative overflow-hidden gap-0 py-0">
              <CardContent className="flex flex-1 flex-col p-8">
                <div className="mb-6">
                  <Badge variant="secondary" className="mb-4">
                    {t('extraListings.badge')}
                  </Badge>
                  <h2 className="text-2xl font-bold">{t('extraListings.title')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('extraListings.description')}
                  </p>
                </div>

                <ul className="mb-8 space-y-3">
                  {[
                    { icon: Check, key: 'oneTime' },
                    { icon: Clock, key: 'lifetime' },
                    { icon: ShieldCheck, key: 'antiAbuse' },
                  ].map(({ icon: Icon, key }) => (
                    <li key={key} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Icon className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm">{t(`extraListings.${key}`)}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/create-listing">{t('extraListings.cta')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Cost Report Access */}
            <Card className="relative overflow-hidden gap-0 py-0">
              <CardContent className="flex flex-1 flex-col p-8">
                <div className="mb-6">
                  <Badge variant="secondary" className="mb-4">
                    {t('costAccess.badge')}
                  </Badge>
                  <h2 className="text-2xl font-bold">{t('costAccess.title')}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t('costAccess.description')}
                  </p>
                </div>

                <div className="mb-6 space-y-2">
                  {costAccessTiers.map(({ key }) => (
                    <div key={key} className="flex items-center gap-2 rounded-lg border px-4 py-3">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{t(`costAccess.${key}`)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto">
                  <p className="mb-6 text-center text-xs text-muted-foreground">
                    {t('costAccess.alternative')}
                  </p>

                  <Button asChild variant="outline" className="w-full">
                    <Link href="/warsaw/costs">{t('costAccess.cta')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
