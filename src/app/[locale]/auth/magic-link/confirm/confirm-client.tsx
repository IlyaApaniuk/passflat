'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Loader2 } from 'lucide-react';

/**
 * Renders the "tap to sign in" button for the magic-link email. Verification
 * happens on /auth/callback — we navigate there only on the user's click, so
 * mail-scanner prefetches of the email link (which land on this page) never
 * consume the single-use token.
 */
export function MagicLinkConfirm({ tokenHash, next }: { tokenHash?: string; next?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { locale } = useParams<{ locale: string }>();
  const [isNavigating, setIsNavigating] = useState(false);

  function handleConfirm() {
    if (!tokenHash) return;
    setIsNavigating(true);
    const params = new URLSearchParams({ token_hash: tokenHash, type: 'magiclink' });
    if (next) params.set('next', next);
    // Full navigation (not client routing) so the callback GET runs server-side
    // and sets the session cookies before the redirect.
    window.location.assign(`/${locale}/auth/callback?${params.toString()}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <Home className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">{tc('appName')}</span>
        </Link>

        {!tokenHash ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <h2 className="text-lg font-semibold">{t('magicLink.invalidTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('magicLink.invalidDescription')}
              </p>
              <Link href="/auth/login" className="mt-6 text-sm text-primary hover:underline">
                {t('magicLink.requestNew')}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>{t('magicLink.confirmTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                {t('magicLink.confirmDescription')}
              </p>
              <Button onClick={handleConfirm} className="w-full" disabled={isNavigating}>
                {isNavigating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('magicLink.confirmCta')
                )}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
