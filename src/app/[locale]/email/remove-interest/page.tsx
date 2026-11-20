import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { verifyInterestRemovalToken } from '@/lib/email/unsubscribe';

// Opened from the link shown after saving a listings interest (spec 02 §Remove-interest
// link), usually by a logged-out visitor, and it mutates on load like the unsubscribe page —
// never prerender or index it.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function RemoveInterestPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('unsubscribe');

  const rowId = verifyInterestRemovalToken(token);
  let ok = false;
  if (rowId) {
    // deleteMany → no throw if the row is gone (removed before, or by the 12-month cron).
    // Only a listings-interest row: city-launch rows are never touched by this link.
    const res = await prisma.cityNotifySubscription.deleteMany({
      where: { id: rowId, listingType: { not: '' } },
    });
    ok = res.count > 0;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 pt-24">
        <div className="container mx-auto max-w-lg px-4 py-16 text-center">
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
              ok ? 'bg-primary/10' : 'bg-destructive/10'
            }`}
          >
            {ok ? (
              <CheckCircle2 className="h-7 w-7 text-primary" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {ok ? t('removeInterest.successTitle') : t('removeInterest.errorTitle')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {ok ? t('removeInterest.successDesc') : t('removeInterest.errorDesc')}
          </p>
          <Button asChild className="mt-6">
            <Link href="/">{t('home')}</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
