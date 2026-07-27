'use client';

import type { LucideIcon } from 'lucide-react';
import { AddressAutocomplete, type PlaceResult } from '@/components/listings/address-autocomplete';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

interface AddressIntakeProps {
  badge: string;
  badgeIcon: LucideIcon;
  title: string;
  subtitle: string;
  label: string;
  placeholder: string;
  hint: string;
  /** Optional second line: what filling this in will actually cost the visitor. */
  note?: string;
  bounds?: { north: number; south: number; east: number; west: number };
  /** Remounts the autocomplete, e.g. to reset it after a completed check. */
  inputKey?: string;
  defaultValue?: string;
  onPlaceSelect: (place: PlaceResult) => void;
  /** Status lines, errors or anything else that belongs under the field. */
  children?: React.ReactNode;
}

/**
 * The shared top of every "give us an address" page.
 *
 * The checker and the review page ask different questions but run the same
 * machine: resolve an address, persist a building, then diverge. Keeping the
 * header and the field in one place is what stops them drifting apart again —
 * they had already diverged in container width and heading size.
 */
export function AddressIntake({
  badge,
  badgeIcon: BadgeIcon,
  title,
  subtitle,
  label,
  placeholder,
  hint,
  note,
  bounds,
  inputKey,
  defaultValue,
  onPlaceSelect,
  children,
}: AddressIntakeProps) {
  return (
    <>
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <BadgeIcon className="h-4 w-4" />
          {badge}
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">{title}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-base text-muted-foreground sm:text-lg">
          {subtitle}
        </p>
      </div>

      <Card className="mt-8">
        <CardContent className="px-5 sm:px-6">
          <Label className="text-sm font-medium">{label}</Label>
          <div className="mt-2">
            <AddressAutocomplete
              key={inputKey}
              onPlaceSelect={onPlaceSelect}
              placeholder={placeholder}
              defaultValue={defaultValue}
              bounds={bounds}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
          {note && <p className="mt-1 text-xs font-medium text-primary">{note}</p>}
          {children}
        </CardContent>
      </Card>
    </>
  );
}
