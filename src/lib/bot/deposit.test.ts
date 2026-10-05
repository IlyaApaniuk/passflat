import { describe, expect, it } from 'vitest';

import {
  addOneMonth,
  assessDeposit,
  buildDemandLetter,
  formatPolishDate,
  parseAmount,
  parseMoveOutDate,
} from './deposit';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const TODAY = d('2026-10-05');

describe('addOneMonth', () => {
  it('counts a month the way KC art. 112 does', () => {
    expect(formatPolishDate(addOneMonth(d('2026-09-12')))).toBe('12.10.2026');
    expect(formatPolishDate(addOneMonth(d('2026-01-31')))).toBe('28.02.2026');
    expect(formatPolishDate(addOneMonth(d('2028-01-31')))).toBe('29.02.2028');
    expect(formatPolishDate(addOneMonth(d('2026-12-15')))).toBe('15.01.2027');
  });
});

describe('parseMoveOutDate', () => {
  it.each([
    ['12.09.2026', '12.09.2026'],
    ['12.09', '12.09.2026'],
    ['1/9/26', '01.09.2026'],
    ['вчера', '04.10.2026'],
    ['dziś', '05.10.2026'],
    // "12.12" typed in October means last December, not a future date.
    ['12.12', '12.12.2025'],
  ])('%s → %s', (input, expected) => {
    expect(formatPolishDate(parseMoveOutDate(input, TODAY)!)).toBe(expected);
  });

  it.each(['31.02.2026', '12.13', 'завтра', '01.01.2020', '10.10.2026', 'Grójecka 45'])(
    'rejects %s',
    (input) => {
      expect(parseMoveOutDate(input, TODAY)).toBeNull();
    },
  );
});

describe('parseAmount', () => {
  it.each([
    ['3600', 3600],
    ['3 600 zł', 3600],
    ['3 600,00', 3600],
    ['4500 злотых', 4500],
  ])('%s → %d', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it.each(['ничего', '0', '-100', 'много'])('rejects %s', (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

describe('assessDeposit', () => {
  const base = { deposit: 4000, returned: 1000, protocol: 'both' as const };

  it('is overdue a day after the month runs out', () => {
    const verdict = assessDeposit(
      { ...base, reason: 'silent', movedOutAt: d('2026-09-01') },
      TODAY,
    );
    expect(verdict.overdue).toBe(true);
    expect(verdict.days).toBe(4);
    expect(verdict.claim).toBe(3000);
  });

  it('is not overdue on the deadline day itself', () => {
    const verdict = assessDeposit(
      { ...base, reason: 'silent', movedOutAt: d('2026-09-05') },
      TODAY,
    );
    expect(verdict.overdue).toBe(false);
    expect(verdict.days).toBe(0);
  });

  it('rates ordinary wear as having no legal footing', () => {
    const verdict = assessDeposit({ ...base, reason: 'wear', movedOutAt: d('2026-08-01') }, TODAY);
    expect(verdict.strength).toBe('strong');
  });

  it('treats unpaid bills as a lawful deduction', () => {
    const verdict = assessDeposit({ ...base, reason: 'bills', movedOutAt: d('2026-08-01') }, TODAY);
    expect(verdict.strength).toBe('lawful');
  });

  it('weakens a damage dispute without a handover protocol', () => {
    const withProtocol = assessDeposit(
      { ...base, reason: 'damage', movedOutAt: d('2026-08-01') },
      TODAY,
    );
    const without = assessDeposit(
      { ...base, protocol: 'none', reason: 'damage', movedOutAt: d('2026-08-01') },
      TODAY,
    );
    expect(withProtocol.strength).toBe('medium');
    expect(without.strength).toBe('weak');
  });
});

describe('buildDemandLetter', () => {
  const letter = buildDemandLetter({
    movedOutAt: d('2026-08-20'),
    deposit: 4000,
    returned: 500,
    reason: 'wear',
    protocol: 'both',
    today: TODAY,
  });

  it('claims what was not returned, with the statute and the passed deadline', () => {
    expect(letter).toContain('WEZWANIE DO ZAPŁATY');
    // Polish groups thousands only from five digits: 3500,00 zł but 13 500,00 zł.
    expect(letter).toMatch(/kwocie 3500,00.zł/);
    expect(letter).toContain('art. 6 ust. 4');
    expect(letter).toContain('Termin ten upłynął w dniu 20.09.2026.');
    expect(letter).toContain('art. 675 § 1');
  });

  it('leaves personal data as placeholders instead of asking for it', () => {
    expect(letter).toContain('[Imię i nazwisko najemcy]');
    expect(letter).toContain('[numer rachunku]');
  });
});
