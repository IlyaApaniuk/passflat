'use client';

import { useTranslations } from 'next-intl';
import { figurePinColors } from '@/lib/map-style';
import { cn } from '@/lib/utils';

/**
 * What a single-number pin's colour and "+" mean (spec 03 §Single-number
 * surfaces, D23): tenant reports, asking prices in grey, and "+" after a number
 * that is not an all-in total. The cost map and the checker's neighbour layer
 * show the same legend; the caller places it.
 */
export function FigureMapLegend({ className }: { className?: string }) {
  const t = useTranslations();
  const tenant = figurePinColors('tenant');
  const asking = figurePinColors('asking');

  return (
    <div
      data-legend=""
      className={cn(
        'pointer-events-none z-10 max-w-[calc(100%-1rem)] space-y-0.5 rounded-md bg-white/90 px-2 py-1.5 text-[11px] leading-tight text-slate-700 shadow-sm backdrop-blur-sm',
        className,
      )}
    >
      <p className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: tenant.fill, borderColor: tenant.stroke }}
        />
        {t('costs.building.figures.tenantTitle')}
      </p>
      <p className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full border"
          style={{ backgroundColor: asking.fill, borderColor: asking.stroke }}
        />
        {t('costs.building.figures.askingTitle')}
      </p>
      <p>{t('costs.overview.mapLegendPart')}</p>
    </div>
  );
}
