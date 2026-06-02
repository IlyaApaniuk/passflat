'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Globe, Send, CheckCircle2, MapPin } from 'lucide-react';

export function CityNotify() {
  const t = useTranslations('landing.cityNotify');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !city) return;

    if (!consent) {
      setConsentError(true);
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch('/api/city-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, city, consent: true, locale }),
      });
      if (!res.ok) throw new Error();
      setStatus('success');
      setEmail('');
      setCity('');
      setConsent(false);
      setConsentError(false);
    } catch {
      setStatus('error');
    }
  };

  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/5 to-transparent" />

      <div className="relative z-10 container mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent">
              <Globe className="h-4 w-4" />
              {t('badge')}
            </div>

            <h2 className="mb-6 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {t('title')}
            </h2>

            <p className="mb-8 text-lg text-muted-foreground">{t('subtitle')}</p>

            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <MapPin className="h-5 w-5 text-accent" />
              <span>{t('currentCity')}</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <div className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/80 p-6 backdrop-blur-xl sm:p-8">
              <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-accent/20 blur-[80px]" />

              {status === 'success' ? (
                <div className="relative flex flex-col items-center gap-3 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
                    <CheckCircle2 className="h-7 w-7 text-accent" />
                  </div>
                  <p className="text-lg font-medium">{t('success')}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="relative space-y-4">
                  <div className="space-y-3">
                    <Input
                      type="email"
                      required
                      placeholder={t('emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 rounded-xl text-base"
                    />
                    <Input
                      type="text"
                      required
                      placeholder={t('cityPlaceholder')}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="h-12 rounded-xl text-base"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="city-notify-consent"
                        checked={consent}
                        onCheckedChange={(checked) => {
                          setConsent(checked === true);
                          if (checked) setConsentError(false);
                        }}
                        aria-invalid={consentError}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="city-notify-consent"
                        className="text-sm font-normal leading-snug"
                      >
                        {t('consent')}
                      </Label>
                    </div>
                    {consentError && (
                      <p className="text-xs text-destructive">{t('consentRequired')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t.rich('privacyNote', {
                        privacyLink: (chunks) => (
                          <Link href="/privacy" className="text-primary hover:underline">
                            {chunks}
                          </Link>
                        ),
                      })}
                    </p>
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={status === 'loading' || !consent}
                    className="h-12 w-full rounded-xl text-base"
                  >
                    <Send className="mr-2 h-4 w-4" />
                    {t('submit')}
                  </Button>

                  {status === 'error' && <p className="text-sm text-destructive">{t('error')}</p>}
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
