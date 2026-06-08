'use client';

import { useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface MonthYearPickerProps {
  id?: string;
  /** Selected value as "YYYY-MM" (empty string when unset). */
  value: string;
  onChange: (value: string) => void;
  /** Active app locale (e.g. "ru") — drives localized month names. */
  locale: string;
  placeholder?: string;
  /** Inclusive earliest selectable month, "YYYY-MM". */
  min?: string;
  /** Inclusive latest selectable month, "YYYY-MM". */
  max?: string;
}

function parse(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  if (month < 0 || month > 11) return null;
  return { year, month };
}

function ym(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * Month-precision date picker styled to match the platform (Popover + Button
 * primitives), replacing the off-brand native `<input type="month">`. Keeps the
 * low-friction "month + year" granularity used for tenancy dates while looking
 * consistent with the rest of the product.
 */
export function MonthYearPicker({
  id,
  value,
  onChange,
  locale,
  placeholder,
  min,
  max,
}: MonthYearPickerProps) {
  const selected = parse(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => selected?.year ?? new Date().getFullYear());

  const monthNames = Array.from({ length: 12 }, (_, m) =>
    new Date(2000, m, 1).toLocaleString(locale, { month: 'short' }),
  );

  const triggerLabel = selected
    ? new Date(selected.year, selected.month, 1).toLocaleString(locale, {
        month: 'long',
        year: 'numeric',
      })
    : null;

  const isDisabled = (year: number, month: number) => {
    const v = ym(year, month);
    if (min && v < min) return true;
    if (max && v > max) return true;
    return false;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-9 w-full justify-start text-left text-sm font-normal hover:border-primary/40"
        >
          <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
          {triggerLabel ? (
            <span className="capitalize">{triggerLabel}</span>
          ) : (
            <span className="text-xs text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="mb-2 flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums">{viewYear}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setViewYear((y) => y + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {monthNames.map((name, m) => {
            const isSelected = selected?.year === viewYear && selected?.month === m;
            const disabled = isDisabled(viewYear, m);
            return (
              <Button
                key={m}
                type="button"
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                disabled={disabled}
                className={cn('h-9 capitalize', !isSelected && 'font-normal')}
                onClick={() => {
                  onChange(ym(viewYear, m));
                  setOpen(false);
                }}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
