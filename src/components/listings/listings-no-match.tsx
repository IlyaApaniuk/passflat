'use client';

import { useTranslations } from 'next-intl';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The city has offers but the filters leave none (spec 02 §Empty states, `no_match_for_filters`).
 * Never says the city is empty; the clear button runs the existing filter reset.
 */
export function ListingsNoMatch({ onClearFilters }: { onClearFilters: () => void }) {
  const t = useTranslations();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 pb-6 pt-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted/50">
        <SearchX className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{t('listings.noMatch.title')}</h3>
      <Button type="button" variant="outline" className="mt-4 h-11" onClick={onClearFilters}>
        {t('listings.noMatch.clearFilters')}
      </Button>
    </div>
  );
}
