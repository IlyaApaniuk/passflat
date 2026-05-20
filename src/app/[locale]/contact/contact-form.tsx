'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export function ContactForm() {
  const t = useTranslations('contact');

  const [formState, setFormState] = useState<FormState>('idle');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const subjectOptions = [
    { value: 'general', label: t('form.subjectGeneral') },
    { value: 'listing', label: t('form.subjectListing') },
    { value: 'costs', label: t('form.subjectCosts') },
    { value: 'bug', label: t('form.subjectBug') },
    { value: 'partnership', label: t('form.subjectPartnership') },
    { value: 'other', label: t('form.subjectOther') },
  ];

  const selectedLabel =
    subjectOptions.find((o) => o.value === subject)?.label ?? subject;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState('submitting');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          subject: selectedLabel,
          message,
        }),
      });

      if (!res.ok) throw new Error('Request failed');

      setFormState('success');
    } catch {
      setFormState('error');
    }
  }

  function resetForm() {
    setName('');
    setEmail('');
    setSubject('');
    setMessage('');
    setFormState('idle');
  }

  const isValid =
    name.trim() && email.trim() && subject && message.trim();

  if (formState === 'success') {
    return (
      <div className="flex flex-col items-center rounded-xl border bg-muted/30 px-8 py-16 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
        <h2 className="mt-4 text-2xl font-bold tracking-tight">
          {t('success.title')}
        </h2>
        <p className="mt-3 max-w-md text-muted-foreground">
          {t('success.description')}
        </p>
        <Button variant="outline" className="mt-8" onClick={resetForm}>
          {t('success.sendAnother')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">{t('form.name')}</Label>
          <Input
            id="name"
            placeholder={t('form.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('form.email')}</Label>
          <Input
            id="email"
            type="email"
            placeholder={t('form.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">{t('form.subject')}</Label>
        <Select value={subject} onValueChange={setSubject}>
          <SelectTrigger id="subject">
            <SelectValue placeholder={t('form.selectSubject')} />
          </SelectTrigger>
          <SelectContent>
            {subjectOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{t('form.message')}</Label>
        <Textarea
          id="message"
          placeholder={t('form.messagePlaceholder')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          required
        />
      </div>

      {formState === 'error' && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {t('error')}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="gap-2"
        disabled={formState === 'submitting' || !isValid}
      >
        <Send className="h-4 w-4" />
        {formState === 'submitting' ? t('form.sending') : t('form.submit')}
      </Button>
    </form>
  );
}
