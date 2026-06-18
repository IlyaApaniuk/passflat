'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';

interface AccountStats {
  activeListings: number;
  conversations: number;
  costReports: number;
  promotedListings: { id: string; title: string; daysRemaining: number }[];
}

interface Props {
  userEmail: string;
}

export function DeleteAccountDialog({ userEmail }: Props) {
  const t = useTranslations('account.delete');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');

  // Reset the form and fetch account data as a side-effect of the dialog
  // opening/closing — synced to the `open` prop, not derivable during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) {
      setConfirmEmail('');
      return;
    }
    setLoading(true);
    fetch('/api/account')
      .then((res) => res.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (res.ok) {
        router.push('/');
        router.refresh();
      }
    } catch (error) {
      console.error('Failed to delete account:', error);
    }
    setDeleting(false);
  };

  const canConfirm = confirmEmail.toLowerCase() === userEmail.toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <Trash2 className="h-4 w-4" />
          {t('title')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {t('title')}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>{t('warning')}</p>
              <p className="text-xs text-muted-foreground">{t('costDataNote')}</p>

              {loading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : stats ? (
                <div className="rounded-md border bg-muted/50 p-3 space-y-1.5">
                  <p>
                    {t('stats', {
                      listings: stats.activeListings,
                      conversations: stats.conversations,
                    })}
                  </p>
                  {stats.promotedListings.map((pl) => (
                    <p key={pl.id} className="text-amber-600 dark:text-amber-400">
                      {t('promotedWarning', {
                        title: pl.title,
                        days: pl.daysRemaining,
                      })}
                    </p>
                  ))}
                  {stats.promotedListings.length > 0 && (
                    <p className="text-xs text-muted-foreground">{t('noRefund')}</p>
                  )}
                </div>
              ) : null}

              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium">{t('confirmLabel')}</label>
                <Input
                  value={confirmEmail}
                  onChange={(e) => setConfirmEmail(e.target.value)}
                  placeholder={userEmail}
                  autoComplete="off"
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm || deleting}
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-2"
          >
            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('button')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
