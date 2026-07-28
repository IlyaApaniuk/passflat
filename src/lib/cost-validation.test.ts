import { describe, it, expect } from 'vitest';
import { validateCostReport, capFreeText, FIELD_RANGES } from './cost-validation';

// Hard errors travel to a ru/uk/pl-speaking visitor, so what matters is that
// each one carries the STRUCTURE (field + bounds) the client needs to build its
// own sentence — the English `message` is a debug fallback only.
describe('validateCostReport — structured hard errors', () => {
  it('accepts values inside every range', () => {
    const result = validateCostReport({ rent: '3000', areaM2: '50', water: '120' });
    expect(result).toMatchObject({ valid: true, hardErrors: [], shouldFlag: false });
  });

  it('reports the bounds of an out-of-range strict field', () => {
    const result = validateCostReport({ rent: '10' });
    expect(result.valid).toBe(false);
    expect(result.hardErrors).toEqual([
      { field: 'rent', min: 100, max: 30_000, message: 'rent must be between 100 and 30000' },
    ]);
  });

  it('reports a negative soft field with the same {min, max} shape', () => {
    const result = validateCostReport({ electricity: '-1' });
    expect(result.valid).toBe(false);
    expect(result.hardErrors).toEqual([
      { field: 'electricity', min: 0, max: 3_000, message: 'electricity cannot be negative' },
    ]);
  });

  it('uses the same bounds the form already shows via FIELD_RANGES', () => {
    const [error] = validateCostReport({ areaM2: '1000' }).hardErrors;
    expect({ min: error.min, max: error.max }).toEqual(FIELD_RANGES.areaM2);
  });

  it('collects every rejected field, not just the first', () => {
    const result = validateCostReport({ rent: '10', rooms: '99' });
    expect(result.hardErrors.map((e) => e.field)).toEqual(['rent', 'rooms']);
  });

  it('flags — but does not reject — an implausibly large soft value', () => {
    const result = validateCostReport({ heating: '9000' });
    expect(result).toMatchObject({ valid: true, shouldFlag: true, flaggedFields: ['heating'] });
  });

  it('ignores empty and unparseable values', () => {
    const result = validateCostReport({ rent: '', areaM2: null, rooms: 'abc' });
    expect(result.valid).toBe(true);
  });
});

describe('capFreeText', () => {
  it('trims, drops non-strings, and caps the stored length', () => {
    expect(capFreeText('  Orange  ')).toBe('Orange');
    expect(capFreeText('   ')).toBeNull();
    expect(capFreeText(42)).toBeNull();
    expect(capFreeText('x'.repeat(600))).toHaveLength(500);
  });
});
