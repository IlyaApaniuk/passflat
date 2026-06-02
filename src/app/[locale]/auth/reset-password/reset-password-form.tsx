'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Loader2, CheckCircle2 } from 'lucide-react';
import { resetPassword } from '../actions';

export function ResetPasswordForm({ tokenHash }: { tokenHash?: string }) {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { locale } = useParams<{ locale: string }>();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(!tokenHash);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);

    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }

    if (!tokenHash) {
      setInvalid(true);
      return;
    }

    startTransition(async () => {
      const result = await resetPassword(tokenHash, password);
      if (result.error === 'invalid') {
        setInvalid(true);
      } else if (result.error) {
        setError(t('resetPassword.error'));
      } else {
        setDone(true);
        setTimeout(() => router.push('/auth/login'), 2500);
      }
    });
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

        {invalid ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <h2 className="text-lg font-semibold">{t('resetPassword.invalidTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('resetPassword.invalidDescription')}
              </p>
              <Link
                href="/auth/forgot-password"
                className="mt-6 text-sm text-primary hover:underline"
              >
                {t('resetPassword.requestNew')}
              </Link>
            </CardContent>
          </Card>
        ) : done ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">{t('resetPassword.successTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('resetPassword.successDescription')}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>{t('resetPassword.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('resetPassword.password')}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('resetPassword.confirmPassword')}</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('resetPassword.submit')
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
