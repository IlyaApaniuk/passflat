'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { routing } from '@/i18n/routing';

interface ShareButtonProps {
  /** Locale-relative path to share, e.g. `/warsaw/building/x`. The absolute URL
   *  (with the share UTM tags) is built on the client from window.location. */
  path: string;
  /** Analytics label + utm_medium (e.g. 'building', 'district', 'city', 'submit'). */
  source: string;
  /** First-touch referral token (the sharer's user id) appended as `?ref=` so a
   *  friend who signs up + contributes is attributed to this sharer. Omitted on
   *  anonymous/static pages where there is no logged-in sharer. */
  refToken?: string;
  /** Override the button text (e.g. "Share district") — defaults to a generic "Share". */
  label?: string;
  /** Message that accompanies the link in the native share sheet (ignored by the
   *  clipboard fallback, which copies the bare URL). Defaults to a generic line. */
  text?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/**
 * Share a link to the open cost data. On mobile (and supporting desktop
 * browsers) this opens the native OS share sheet — one tap into WhatsApp /
 * Telegram / Instagram / etc., where the link's OG card unfurls — and falls back
 * to copy-to-clipboard where the Web Share API is unavailable. Every URL carries
 * `utm_source=share` so share-driven visits show up in the PostHog acquisition
 * cohorts. This is the core viral artifact — the whole strategy leans on people
 * dropping a building's real costs into a flat chat / Telegram / FB group.
 */
export function ShareButton({
  path,
  source,
  refToken,
  label,
  text,
  variant = 'outline',
  size = 'sm',
  className,
}: ShareButtonProps) {
  const t = useTranslations('share');
  const locale = useLocale();
  const posthog = usePostHog();

  const buildUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    // Share in the sharer's own language: friends they send it to speak the same
    // language. `localePrefix: 'as-needed'` → the default locale has no prefix,
    // the others do. `path` is always locale-relative (e.g. `/warsaw/...`).
    const localePrefix = locale === routing.defaultLocale ? '' : `/${locale}`;
    const sep = path.includes('?') ? '&' : '?';
    const ref = refToken ? `&ref=${encodeURIComponent(refToken)}` : '';
    return `${origin}${localePrefix}${path}${sep}utm_source=share&utm_medium=${encodeURIComponent(source)}${ref}`;
  };

  const onShare = async () => {
    const url = buildUrl();
    const canNativeShare =
      typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    posthog?.capture('share_clicked', { source, path, native: canNativeShare });

    if (canNativeShare) {
      try {
        await navigator.share({ title: 'Passflat', text: text ?? t('shareText'), url });
        return;
      } catch (err) {
        // User dismissed the sheet → stop (don't also copy). Any other error
        // (e.g. share not allowed) → fall through to the clipboard fallback.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('copied'));
    } catch {
      // Clipboard blocked — nothing else to do.
    }
  };

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={onShare}>
      <Share2 className="mr-1.5 h-4 w-4" />
      {label ?? t('share')}
    </Button>
  );
}
