'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Loader2, Mail } from 'lucide-react';
import { signInWithMagicLink } from './actions';

/**
 * Passwordless sign-in form shown only inside in-app browsers (Instagram/
 * Facebook WebViews) where Google OAuth is blocked. One email field → emailed
 * magic link. The normal-browser flow keeps Google + email/password untouched.
 */
export function MagicLinkForm({ next }: { next?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { locale } = useParams<{ locale: string }>();

  const posthog = usePostHog();
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    posthog?.capture('auth_started', {
      method: 'magiclink',
      has_next_url: !!next,
      trigger: next ? 'required' : 'voluntary',
      next_kind: next ? (next.includes('/costs/submit') ? 'cost_submit' : 'other') : 'none',
      // Distinguishes the in-app-browser funnel from the normal-browser one.
      in_app_browser: true,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(formData: FormData) {
    setError(null);
    formData.set('locale', locale);
    if (next) formData.set('next', next);

    startTransition(async () => {
      const result = await signInWithMagicLink(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.success) {
        setEmailSent(true);
      }
    });
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <div className="w-full max-w-sm space-y-6">
          <Link href="/" className="flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Home className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold tracking-tight">{tc('appName')}</span>
          </Link>

          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">{t('magicLink.sentTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{t('magicLink.sentDescription')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
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

        <Card>
          <CardHeader className="text-center">
            <CardTitle>{t('magicLink.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              {t('magicLink.description')}
            </p>

            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <form action={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('magicLink.email')}</Label>
                <Input id="email" name="email" type="email" autoComplete="email" required />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('magicLink.submit')}
              </Button>
            </form>

            <p className="text-center text-xs text-muted-foreground">{t('magicLink.hint')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
