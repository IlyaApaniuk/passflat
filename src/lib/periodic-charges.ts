export const PERIODIC_FREQUENCIES = ['bimonthly', 'quarterly', 'semiannual', 'annual'] as const;

export type PeriodicFrequency = (typeof PERIODIC_FREQUENCIES)[number];

export const PERIODIC_CATEGORIES = ['water', 'electricity', 'gas', 'heating', 'other'] as const;

export type PeriodicCategory = (typeof PERIODIC_CATEGORIES)[number];

const MONTHS_PER_FREQUENCY: Record<PeriodicFrequency, number> = {
  bimonthly: 2,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export function isPeriodicFrequency(value: unknown): value is PeriodicFrequency {
  return typeof value === 'string' && (PERIODIC_FREQUENCIES as readonly string[]).includes(value);
}

export function isPeriodicCategory(value: unknown): value is PeriodicCategory {
  return typeof value === 'string' && (PERIODIC_CATEGORIES as readonly string[]).includes(value);
}

export function monthsForFrequency(frequency: PeriodicFrequency): number {
  return MONTHS_PER_FREQUENCY[frequency];
}

/** Monthly-equivalent cost of a charge billed once every N months. */
export function monthlyEquivalent(amount: number, frequency: PeriodicFrequency): number {
  const months = MONTHS_PER_FREQUENCY[frequency];
  if (!months || amount <= 0) return 0;
  return amount / months;
}

export interface PeriodicChargeLike {
  // Accepts numbers, strings, or Prisma Decimal (anything Number() can coerce).
  amount: number | string | { toString(): string } | null | undefined;
  frequency: string | null | undefined;
}

/** Sum of monthly-equivalents across a list of periodic charges. */
export function periodicChargesMonthlyTotal(charges: PeriodicChargeLike[]): number {
  return charges.reduce((sum, charge) => {
    const amount = typeof charge.amount === 'number' ? charge.amount : Number(charge.amount);
    if (!Number.isFinite(amount) || !isPeriodicFrequency(charge.frequency)) return sum;
    return sum + monthlyEquivalent(amount, charge.frequency);
  }, 0);
}

export interface CleanPeriodicCharge {
  category: PeriodicCategory;
  amount: number;
  frequency: PeriodicFrequency;
  note: string | null;
}

const MAX_PERIODIC_CHARGES = 20;
const MAX_PERIODIC_AMOUNT = 100_000;

/** Validate/normalize untrusted periodic-charge input from a request body. */
export function sanitizePeriodicCharges(input: unknown): CleanPeriodicCharge[] {
  if (!Array.isArray(input)) return [];
  const out: CleanPeriodicCharge[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const { category, amount, frequency, note } = item as Record<string, unknown>;
    const amt = typeof amount === 'number' ? amount : parseFloat(String(amount));
    if (
      !isPeriodicCategory(category) ||
      !isPeriodicFrequency(frequency) ||
      !Number.isFinite(amt) ||
      amt <= 0 ||
      amt > MAX_PERIODIC_AMOUNT
    ) {
      continue;
    }
    out.push({
      category,
      amount: amt,
      frequency,
      note: typeof note === 'string' && note.trim() ? note.trim().slice(0, 200) : null,
    });
    if (out.length >= MAX_PERIODIC_CHARGES) break;
  }
  return out;
}
