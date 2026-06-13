'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Loader2 } from 'lucide-react';

const REASONS = ['scam', 'inaccurate', 'offensive', 'spam', 'other'] as const;

/**
 * Abuse-report control for a piece of public user content (listings today).
 * Opens a small dialog with a reason + optional detail and POSTs to /api/reports.
 * Reporting requires an account; guests get a nudge to sign in instead of the
 * dialog. The icon button sits alongside Share/Favorite on the listing header.
 */
export function ReportButton({
  targetType = 'listing',
  targetId,
  isLoggedIn,
}: {
  targetType?: string;
  targetId: string;
  isLoggedIn: boolean;
}) {
  const t = useTranslations('listings.report');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number]>('scam');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onTrigger = () => {
    if (!isLoggedIn) {
      toast.error(t('loginRequired'));
      return;
    }
    setOpen(true);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      });
      if (res.status === 401) {
        toast.error(t('loginRequired'));
        setOpen(false);
        return;
      }
      if (!res.ok) throw new Error();
      toast.success(t('success'));
      setOpen(false);
      setDetail('');
    } catch {
      toast.error(t('error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        title={t('button')}
        aria-label={t('button')}
        className="transition-transform hover:scale-105"
        onClick={onTrigger}
      >
        <Flag className="h-4 w-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <RadioGroup
            value={reason}
            onValueChange={(v) => setReason(v as (typeof REASONS)[number])}
            className="gap-2"
          >
            {REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`report-${r}`} />
                <Label htmlFor={`report-${r}`} className="font-normal">
                  {t(`reasons.${r}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={t('detailPlaceholder')}
            maxLength={1000}
            rows={3}
          />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {t('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
