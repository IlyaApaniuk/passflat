'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';
import { Check, Loader2, MessageSquarePlus } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAnalyticsConsent } from '@/lib/consent';
import { BUILDING_TAG_SECTIONS, type TagSentiment } from '@/lib/building-tags';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BuildingTagPickerProps {
  buildingId: string;
  citySlug: string;
  address: string;
  /** Where this picker is mounted, for funnel analytics. */
  source: 'cost_submit' | 'review_page' | 'checker';
  /** Shown after saving: nudges the contributor into the cost form. */
  showCostHook?: boolean;
  placeId?: string | null;
  onSaved?: (count: number) => void;
}

const SENTIMENT_STYLES: Record<TagSentiment, string> = {
  good: 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  neutral: 'border-primary bg-primary/10 text-primary',
  bad: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-500',
};

/**
 * A closed vocabulary of building facts, ticked in one pass.
 *
 * Deliberately not a star rating or a text box: with a fixed list there is
 * nothing to pre-moderate, nothing that can name a person, and a single
 * response already says something concrete — which is what a one-star review
 * with no explanation never does.
 */
export function BuildingTagPicker({
  buildingId,
  citySlug,
  address,
  source,
  showCostHook = false,
  placeId,
  onSaved,
}: BuildingTagPickerProps) {
  const t = useTranslations();
  const posthog = usePostHog();
  const analyticsConsent = useAnalyticsConsent();
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const toggle = useCallback((key: string) => {
    setStatus('idle');
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }, []);

  const submit = async () => {
    if (selected.length === 0) return;
    setStatus('saving');
    try {
      const response = await fetch('/api/building-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, tags: selected }),
      });
      if (!response.ok) throw new Error('save failed');

      setStatus('saved');
      if (analyticsConsent) {
        posthog?.capture('building_tags_submitted', {
          city: citySlug,
          building_id: buildingId,
          source,
          count: selected.length,
        });
      }
      onSaved?.(selected.length);
    } catch {
      setStatus('error');
    }
  };

  if (status === 'saved') {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-5 w-5 text-primary" />
        </div>
        <p className="mt-3 font-semibold">{t('buildingTagPicker.savedTitle')}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('buildingTagPicker.savedBody', { count: selected.length })}
        </p>
        {showCostHook && (
          <Button className="mt-4 rounded-full" asChild>
            <Link
              href={`/${citySlug}/costs/submit${placeId ? `?p=${encodeURIComponent(placeId)}&source=review` : ''}`}
              onClick={() =>
                analyticsConsent &&
                posthog?.capture('review_to_costs_clicked', {
                  city: citySlug,
                  building_id: buildingId,
                })
              }
            >
              {t('buildingTagPicker.costHook')}
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <MessageSquarePlus className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{t('buildingTagPicker.title')}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('buildingTagPicker.subtitle', { address })}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {BUILDING_TAG_SECTIONS.map((section) => (
          <div key={section.key}>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(`buildingTags.sections.${section.key}`)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {section.items.map((item) => {
                const isOn = selected.includes(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggle(item.key)}
                    aria-pressed={isOn}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm transition-colors',
                      isOn
                        ? SENTIMENT_STYLES[item.sentiment]
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                    )}
                  >
                    {t(`buildingTags.tags.${item.key}`)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {status === 'error' && (
        <p className="mt-4 text-sm text-destructive">{t('buildingTagPicker.error')}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={submit}
          disabled={selected.length === 0 || status === 'saving'}
          className="rounded-full"
        >
          {status === 'saving' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('buildingTagPicker.submit', { count: selected.length })}
        </Button>
        <p className="text-xs text-muted-foreground">{t('buildingTagPicker.privacy')}</p>
      </div>
    </div>
  );
}
