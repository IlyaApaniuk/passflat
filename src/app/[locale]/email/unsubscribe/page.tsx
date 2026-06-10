import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Footer } from '@/components/landing/footer';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

// One-click unsubscribe is opened from an email by a (usually logged-out)
// recipient, and it mutates on load — never prerender or index it.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}

export default async function UnsubscribePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations('unsubscribe');

  const userId = verifyUnsubscribeToken(token);
  let ok = false;
  if (userId) {
    // updateMany → no throw if the profile is gone (deleted account).
    const res = await prisma.profile.updateMany({
      where: { id: userId },
      data: { emailsOptOut: true },
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
          <h1 className="text-2xl font-bold">{ok ? t('successTitle') : t('errorTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{ok ? t('successDesc') : t('errorDesc')}</p>
          <Button asChild className="mt-6">
            <Link href="/">{t('home')}</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
