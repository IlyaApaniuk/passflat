'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { useTranslations } from 'next-intl';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.generic');

  useEffect(() => {
    console.error(error);
    if (posthog.__loaded) {
      posthog.captureException(error, { digest: error.digest });
    }
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="absolute inset-0 grid-pattern opacity-50" />
      <div className="absolute -left-32 top-1/4 h-96 w-96 animate-pulse rounded-full bg-destructive/10 blur-[120px]" />

      <div className="relative z-10 container mx-auto px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{t('metaTitle')}</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('heading')}</h1>
          <p className="mx-auto mt-4 max-w-lg text-lg text-muted-foreground">{t('description')}</p>

          {error.digest && (
            <p className="mt-3 font-mono text-xs text-muted-foreground/70">{error.digest}</p>
          )}

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button size="lg" className="group h-12 rounded-full px-8 text-base" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('retry')}
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full px-8 text-base"
            >
              <Link href="/">
                <Home className="mr-2 h-4 w-4" />
                {t('home')}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
