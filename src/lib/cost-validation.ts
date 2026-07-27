type Range = { min: number; max: number };

interface StrictField {
  type: 'strict';
  range: Range;
}

interface SoftField {
  type: 'soft';
  max: number;
}

const STRICT_FIELDS: Record<string, StrictField> = {
  rent: { type: 'strict', range: { min: 100, max: 30_000 } },
  adminFee: { type: 'strict', range: { min: 0, max: 5_000 } },
  areaM2: { type: 'strict', range: { min: 5, max: 500 } },
  rooms: { type: 'strict', range: { min: 1, max: 20 } },
  deposit: { type: 'strict', range: { min: 0, max: 100_000 } },
};

const SOFT_FIELDS: Record<string, SoftField> = {
  electricity: { type: 'soft', max: 3_000 },
  gas: { type: 'soft', max: 3_000 },
  heating: { type: 'soft', max: 5_000 },
  water: { type: 'soft', max: 2_000 },
  internet: { type: 'soft', max: 1_000 },
  otherCosts: { type: 'soft', max: 5_000 },
  depositReturnDays: { type: 'soft', max: 730 },
};

// Exposed so the submit form can reuse the same ranges for inline, pre-submit
// warnings (these are plain constants — safe to import on the client). Soft
// fields carry an implicit min of 0 — a negative utility/cost is never valid.
export const FIELD_RANGES: Record<string, { min?: number; max: number }> = {
  ...Object.fromEntries(
    Object.entries(STRICT_FIELDS).map(([k, v]) => [k, { min: v.range.min, max: v.range.max }]),
  ),
  ...Object.fromEntries(Object.entries(SOFT_FIELDS).map(([k, v]) => [k, { min: 0, max: v.max }])),
};

/**
 * Free-text notes (`otherCostsNote`, `internetProvider`) land in unbounded
 * `text` columns on a route open to anonymous submitters, so cap what we store.
 */
const FREE_TEXT_MAX = 500;

export function capFreeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, FREE_TEXT_MAX) : null;
}

export interface ValidationResult {
  valid: boolean;
  hardErrors: { field: string; message: string }[];
  shouldFlag: boolean;
  flaggedFields: string[];
}

export function validateCostReport(
  data: Record<string, string | number | null | undefined>,
): ValidationResult {
  const hardErrors: { field: string; message: string }[] = [];
  const flaggedFields: string[] = [];

  for (const [field, config] of Object.entries(STRICT_FIELDS)) {
    const raw = data[field];
    if (raw == null || raw === '') continue;
    const value = typeof raw === 'number' ? raw : parseFloat(raw);
    if (isNaN(value)) continue;
    if (value < config.range.min || value > config.range.max) {
      hardErrors.push({
        field,
        message: `${field} must be between ${config.range.min} and ${config.range.max}`,
      });
    }
  }

  for (const [field, config] of Object.entries(SOFT_FIELDS)) {
    const raw = data[field];
    if (raw == null || raw === '') continue;
    const value = typeof raw === 'number' ? raw : parseFloat(raw);
    if (isNaN(value)) continue;
    // A negative utility/cost is garbage (it would understate the total) — reject
    // it outright; only an implausibly LARGE value is a soft flag.
    if (value < 0) {
      hardErrors.push({ field, message: `${field} cannot be negative` });
    } else if (value > config.max) {
      flaggedFields.push(field);
    }
  }

  return {
    valid: hardErrors.length === 0,
    hardErrors,
    shouldFlag: flaggedFields.length > 0,
    flaggedFields,
  };
}
