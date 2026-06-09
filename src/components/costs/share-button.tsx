'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Button } from '@/components/ui/button';
import { Share2, Check } from 'lucide-react';

interface ShareButtonProps {
  /** Locale-relative path to share, e.g. `/warsaw/building/x`. The absolute URL
   *  (with the share UTM tags) is built on the client from window.location. */
  path: string;
  /** Analytics label + utm_medium (e.g. 'building', 'district', 'city', 'submit'). */
  source: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

/**
 * Copy a shareable link to the open cost data — a plain copy-to-clipboard, no OS
 * share sheet. Every copied URL carries `utm_source=share` so share-driven visits
 * show up in the PostHog acquisition cohorts. This is the core viral artifact —
 * the whole strategy leans on people dropping a building's real costs into a flat
 * chat / Telegram / FB group.
 */
export function ShareButton({
  path,
  source,
  variant = 'outline',
  size = 'sm',
  className,
}: ShareButtonProps) {
  const t = useTranslations('share');
  const posthog = usePostHog();
  const [copied, setCopied] = useState(false);

  const buildUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const sep = path.includes('?') ? '&' : '?';
    return `${origin}${path}${sep}utm_source=share&utm_medium=${encodeURIComponent(source)}`;
  };

  const onCopy = async () => {
    const url = buildUrl();
    posthog?.capture('share_clicked', { source, path });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — nothing else to do.
    }
  };

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={onCopy}>
      {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Share2 className="mr-1.5 h-4 w-4" />}
      {copied ? t('copied') : t('share')}
    </Button>
  );
}
