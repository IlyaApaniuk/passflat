import {
  AlertCircle,
  Ambulance,
  Beer,
  Flame,
  Music,
  TrainTrack,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Presentational and hook-free, so the checker (a client component with the
// scoped `checker` messages) and the building page (a server component with the
// full catalog) render the same block from their own translations.

const NUISANCE_ICONS: Record<string, LucideIcon> = {
  fireStation: Flame,
  hospital: Ambulance,
  railway: TrainTrack,
  nightclub: Music,
  bars: Beer,
};

/** A nuisance as `findNuisances` returns it. */
interface NuisanceInput {
  key: string;
  nearestM: number;
  name: string | null;
  count: number;
  report: 'nearest' | 'count';
}

export interface NuisanceItem {
  key: string;
  label: string;
  detail: string;
}

/** Translates a key of the `checker.nuisances` messages, relative to that namespace. */
type NuisanceTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The rows of the nuisance block: the category, then how many or how far and
 * what it means ("2 venues nearby, closest 120 m · noisy in the evenings").
 */
export function nuisanceItems(
  nuisances: NuisanceInput[],
  translate: NuisanceTranslate,
  formatDistance: (distanceM: number) => string,
): NuisanceItem[] {
  return nuisances.map((nuisance) => {
    const where =
      nuisance.report === 'count'
        ? translate('count', {
            count: nuisance.count,
            distance: formatDistance(nuisance.nearestM),
          })
        : `${nuisance.name ? `${nuisance.name} · ` : ''}${formatDistance(nuisance.nearestM)}`;
    return {
      key: nuisance.key,
      label: translate(nuisance.key),
      detail: `${where} · ${translate(`${nuisance.key}Note`)}`,
    };
  });
}

/** "420 m" / "1.2 km" in the reader's locale (the rule of `useDistanceFormatter`). */
export function formatDistanceM(locale: string, distanceM: number): string {
  if (distanceM < 1000) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(distanceM)} m`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(distanceM / 1000)} km`;
}

/** Noise sources near an address: the fact and the distance, the reader decides. */
export function NuisancesCard({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: NuisanceItem[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="grid gap-3 px-4 sm:grid-cols-2 sm:px-6">
        {items.map((item) => {
          const Icon = NUISANCE_ICONS[item.key] ?? AlertCircle;
          return (
            <div
              key={item.key}
              className="flex items-start gap-3 rounded-xl border bg-muted/20 p-3.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                <Icon className="h-[18px] w-[18px] text-amber-600 dark:text-amber-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
