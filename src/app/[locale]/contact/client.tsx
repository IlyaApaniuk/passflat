'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from '@/i18n/navigation';
import { CheckCircle2, Mail, Clock, Send } from 'lucide-react';

export function ContactClient() {
  const t = useTranslations('contact');
  const searchParams = useSearchParams();

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(() => searchParams.get('subject') ?? '');
  const [message, setMessage] = useState(() => searchParams.get('message') ?? '');
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      setConsentError(true);
      return;
    }
    setError('');
    setSending(true);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message, consent: true }),
      });

      if (!res.ok) {
        throw new Error();
      }

      setSent(true);
    } catch {
      setError(t('error'));
    } finally {
      setSending(false);
    }
  }

  function resetForm() {
    setSent(false);
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
    setConsent(false);
    setConsentError(false);
  }

  const subjects = [
    { value: 'general', label: t('form.subjectGeneral') },
    { value: 'listing', label: t('form.subjectListing') },
    { value: 'costs', label: t('form.subjectCosts') },
    { value: 'bug', label: t('form.subjectBug') },
    { value: 'partnership', label: t('form.subjectPartnership') },
    { value: 'other', label: t('form.subjectOther') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('title')}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{t('subtitle')}</p>
        </div>
      </section>

      {/* Form + sidebar */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto grid max-w-4xl gap-12 lg:grid-cols-5">
            {/* Form */}
            <div className="lg:col-span-3">
              {sent ? (
                <Card>
                  <CardContent className="flex flex-col items-center py-12 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
                      <CheckCircle2 className="h-8 w-8 text-accent" />
                    </div>
                    <h2 className="text-2xl font-bold">{t('success.title')}</h2>
                    <p className="mt-2 text-muted-foreground">{t('success.description')}</p>
                    <Button variant="outline" className="mt-6" onClick={resetForm}>
                      {t('success.sendAnother')}
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t('form.name')}</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t('form.namePlaceholder')}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('form.email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder={t('form.emailPlaceholder')}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">{t('form.subject')}</Label>
                    <Select value={subject} onValueChange={setSubject} required>
                      <SelectTrigger id="subject" className="w-full">
                        <SelectValue placeholder={t('form.selectSubject')} />
                      </SelectTrigger>
                      <SelectContent>
                        {subjects.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">{t('form.message')}</Label>
                    <Textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={t('form.messagePlaceholder')}
                      rows={6}
                      required
                    />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="consent"
                        checked={consent}
                        onCheckedChange={(checked) => {
                          setConsent(checked === true);
                          if (checked) setConsentError(false);
                        }}
                        aria-invalid={consentError}
                      />
                      <Label htmlFor="consent" className="text-sm font-normal">
                        {t('form.consent')}
                      </Label>
                    </div>
                    {consentError && (
                      <p className="text-xs text-destructive">{t('form.consentRequired')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t.rich('form.privacyNote', {
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
                    className="gap-2"
                    disabled={sending || !subject || !consent}
                  >
                    <Send className="h-4 w-4" />
                    {sending ? t('form.sending') : t('form.submit')}
                  </Button>
                </form>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-8 lg:col-span-2">
              <div>
                <h3 className="mb-4 text-lg font-semibold">{t('alternatives.title')}</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t('alternatives.email')}</p>
                      <a
                        href={`mailto:${t('alternatives.emailValue')}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {t('alternatives.emailValue')}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{t('alternatives.responseTime')}</p>
                      <p className="text-sm text-muted-foreground">
                        {t('alternatives.responseTimeValue')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
