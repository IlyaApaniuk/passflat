'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import { Building2, ChevronDown, ChevronUp, Lock } from 'lucide-react';

import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface DistrictStatsData {
  slug: string;
  name: string;
  buildingCount: number;
  reportCount: number;
  medianTotal: number;
  medianRent: number;
  medianAdminFee: number;
  medianRentPerM2: number;
  medianTotalPerM2: number;
  medianExpenses: number;
}

type SortKey =
  | 'medianTotal'
  | 'medianRent'
  | 'medianExpenses'
  | 'medianRentPerM2'
  | 'medianTotalPerM2'
  | 'reportCount'
  | 'name';
type SortDir = 'asc' | 'desc';

interface DistrictComparisonProps {
  stats: DistrictStatsData[];
  accessGranted: boolean;
  accessPending: boolean;
  citySlug: string;
}

export function DistrictComparison({
  stats,
  accessGranted,
  accessPending,
  citySlug,
}: DistrictComparisonProps) {
  const t = useTranslations();
  const [sortKey, setSortKey] = useState<SortKey>('medianTotal');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Only districts that actually have reports under the current rental-type
  // filter. Zeroed rows come from computedDistrictStats when a filter excludes
  // every building in a district.
  const districtsWithData = useMemo(() => stats.filter((s) => s.buildingCount > 0), [stats]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...districtsWithData].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir;
      if (sortKey === 'reportCount') return (a.reportCount - b.reportCount) * dir;
      // Cost metrics: treat 0/empty as the worst value so they sort last
      // regardless of direction.
      const av = a[sortKey] || (sortDir === 'asc' ? Infinity : -Infinity);
      const bv = b[sortKey] || (sortDir === 'asc' ? Infinity : -Infinity);
      return (av - bv) * dir;
    });
  }, [districtsWithData, sortKey, sortDir]);

  // Widest total sets the inline-bar scale so every row is comparable.
  const maxTotal = useMemo(
    () => districtsWithData.reduce((m, s) => Math.max(m, s.medianTotal || 0), 0),
    [districtsWithData],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Reports default high→low; cost metrics default cheap→expensive.
      setSortDir(key === 'reportCount' ? 'desc' : 'asc');
    }
  };

  if (districtsWithData.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-16 text-center">
          <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('costs.compare.emptyTitle')}</h3>
          <p className="mt-1 text-muted-foreground">{t('costs.compare.emptyDesc')}</p>
          <Button asChild className="mt-6">
            <Link href={`/${citySlug}/costs/submit`}>{t('costs.overview.submitMyCosts')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t('costs.compare.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('costs.compare.subtitle')}</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          {/* Legend for the inline "Всего" bar: it stacks rent + the rest. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-primary" />
              {t('costs.compare.metricRent')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-muted-foreground/30" />
              {t('costs.compare.metricExpenses')}
            </span>
          </div>

          {/* Unlock prompt — the cost numbers stay locked until the visitor
              contributes a report of their own. */}
          {!accessGranted && !accessPending && (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-center sm:flex-row sm:justify-between sm:text-left">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4" />
                {t('costs.compare.lockedCta')}
              </span>
              <Button asChild size="sm" className="shrink-0">
                <Link href={`/${citySlug}/costs/submit`}>{t('costs.overview.submitMyCosts')}</Link>
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead
                    label={t('costs.compare.colDistrict')}
                    active={sortKey === 'name'}
                    dir={sortDir}
                    onClick={() => toggleSort('name')}
                  />
                  <SortHead
                    label={t('costs.compare.colTotal')}
                    active={sortKey === 'medianTotal'}
                    dir={sortDir}
                    onClick={() => toggleSort('medianTotal')}
                    align="right"
                  />
                  <SortHead
                    label={t('costs.compare.colRent')}
                    active={sortKey === 'medianRent'}
                    dir={sortDir}
                    onClick={() => toggleSort('medianRent')}
                    align="right"
                  />
                  <SortHead
                    label={t('costs.compare.colExpenses')}
                    active={sortKey === 'medianExpenses'}
                    dir={sortDir}
                    onClick={() => toggleSort('medianExpenses')}
                    align="right"
                  />
                  <SortHead
                    label={t('costs.compare.colRentPerM2')}
                    active={sortKey === 'medianRentPerM2'}
                    dir={sortDir}
                    onClick={() => toggleSort('medianRentPerM2')}
                    align="right"
                  />
                  <SortHead
                    label={t('costs.compare.colTotalPerM2')}
                    active={sortKey === 'medianTotalPerM2'}
                    dir={sortDir}
                    onClick={() => toggleSort('medianTotalPerM2')}
                    align="right"
                  />
                  <SortHead
                    label={t('costs.compare.colReports')}
                    active={sortKey === 'reportCount'}
                    dir={sortDir}
                    onClick={() => toggleSort('reportCount')}
                    align="right"
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((s, i) => (
                  <motion.tr
                    key={s.slug}
                    // `layout` animates rows to new positions on sort/filter.
                    // Fade only for entrance (no translate): a downward transform
                    // extends the page scroll area mid-animation, flashing a
                    // vertical scrollbar that then vanishes and shoves content
                    // sideways. Stagger the fade, but keep the reorder snappy and
                    // delay-free so repositioning never lags.
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      opacity: { duration: 0.3, ease: 'easeOut', delay: Math.min(i * 0.035, 0.4) },
                      layout: { duration: 0.3, ease: 'easeOut' },
                    }}
                    className="border-b transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TotalBarCell
                      total={s.medianTotal}
                      rent={s.medianRent}
                      maxTotal={maxTotal}
                      accessGranted={accessGranted}
                      accessPending={accessPending}
                    />
                    <MoneyCell
                      value={s.medianRent}
                      accessGranted={accessGranted}
                      accessPending={accessPending}
                    />
                    <MoneyCell
                      value={s.medianExpenses}
                      accessGranted={accessGranted}
                      accessPending={accessPending}
                    />
                    <MoneyCell
                      value={s.medianRentPerM2}
                      suffix={` ${t('costs.overview.perM2')}`}
                      accessGranted={accessGranted}
                      accessPending={accessPending}
                    />
                    <MoneyCell
                      value={s.medianTotalPerM2}
                      suffix={` ${t('costs.overview.perM2')}`}
                      accessGranted={accessGranted}
                      accessPending={accessPending}
                    />
                    <TableCell className="text-right tabular-nums">{s.reportCount}</TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortHead({
  label,
  active,
  dir,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active &&
          (dir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          ))}
      </button>
    </TableHead>
  );
}

/**
 * The "Всего в месяц" cell: the bold total plus a stacked inline bar whose
 * length is the total relative to the widest district, split into rent (primary)
 * and the remainder (everything else). Gives ranking + composition at a glance
 * without a separate chart. Hidden on mobile to keep the table readable.
 */
function TotalBarCell({
  total,
  rent,
  maxTotal,
  accessGranted,
  accessPending,
}: {
  total: number;
  rent: number;
  maxTotal: number;
  accessGranted: boolean;
  accessPending: boolean;
}) {
  if (accessPending) {
    return (
      <TableCell className="text-right">
        <Skeleton className="ml-auto h-4 w-24" />
      </TableCell>
    );
  }
  if (!accessGranted) {
    return (
      <TableCell className="text-right">
        <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </TableCell>
    );
  }
  if (!total || total <= 0) {
    return (
      <TableCell className="text-right">
        <span className="text-muted-foreground">—</span>
      </TableCell>
    );
  }

  const barPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  // Rent as a share of the total; the remaining segment reads as expenses & other.
  const rentPct = rent > 0 ? Math.min((rent / total) * 100, 100) : 0;

  return (
    <TableCell>
      <div className="flex items-center justify-end gap-3">
        <div className="hidden h-2 w-24 overflow-hidden rounded-full bg-muted sm:block lg:w-40">
          <motion.div
            className="flex h-full"
            initial={{ width: '0%' }}
            animate={{ width: `${barPct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="h-full bg-primary" style={{ width: `${rentPct}%` }} />
            <div className="h-full flex-1 bg-muted-foreground/30" />
          </motion.div>
        </div>
        <span className="font-bold tabular-nums text-primary">≈ {total.toLocaleString()} PLN</span>
      </div>
    </TableCell>
  );
}

function MoneyCell({
  value,
  suffix = '',
  bold = false,
  accessGranted,
  accessPending,
}: {
  value: number;
  suffix?: string;
  bold?: boolean;
  accessGranted: boolean;
  accessPending: boolean;
}) {
  return (
    <TableCell className="text-right tabular-nums">
      {accessPending ? (
        <Skeleton className="ml-auto h-4 w-16" />
      ) : !accessGranted ? (
        <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      ) : value > 0 ? (
        <span className={bold ? 'font-bold text-primary' : ''}>
          ≈ {value.toLocaleString()}
          {suffix}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </TableCell>
  );
}
