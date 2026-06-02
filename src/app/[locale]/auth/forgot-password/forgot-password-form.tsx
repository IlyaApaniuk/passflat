'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Home, Loader2, Mail } from 'lucide-react';
import { requestPasswordReset } from '../actions';

export function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const tc = useTranslations('common');
  const { locale } = useParams<{ locale: string }>();

  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set('locale', locale);
    startTransition(async () => {
      await requestPasswordReset(formData);
      setSubmitted(true);
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

        {submitted ? (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-lg font-semibold">{t('forgotPassword.sentTitle')}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('forgotPassword.sentDescription')}
              </p>
              <Link href="/auth/login" className="mt-6 text-sm text-primary hover:underline">
                {t('forgotPassword.backToLogin')}
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="text-center">
              <CardTitle>{t('forgotPassword.title')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-center text-sm text-muted-foreground">
                {t('forgotPassword.description')}
              </p>

              <form action={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t('forgotPassword.email')}</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
                </div>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('forgotPassword.submit')
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/auth/login" className="text-primary hover:underline">
                  {t('forgotPassword.backToLogin')}
                </Link>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
