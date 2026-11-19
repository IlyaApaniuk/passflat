import { describe, expect, it } from 'vitest';

import { MIN_DEPOSIT_ANSWERS } from '@/lib/cost-figures';
import { depositClaim, type DepositClaimReport } from '@/lib/deposit-claim';

const ended = (
  depositReturned: boolean | null,
  depositAmount: number | null,
  depositReturnedAmount: number | null = null,
  source = 'user',
): DepositClaimReport => ({
  source,
  depositAmount,
  depositReturned,
  depositReturnedAmount,
  isCurrentTenant: false,
});

describe('depositClaim', () => {
  it('counts a partial return as got back and never a current tenant as an answer', () => {
    const claim = depositClaim([
      ended(true, 4000, 4000), // in full
      ended(true, 4000, 2500), // partly
      ended(false, 4000, 0), // kept
      // A current tenant who ticked "returned" is not an answer (the old hero counted it).
      { source: 'user', depositAmount: 4000, depositReturned: true, isCurrentTenant: true },
    ]);

    expect(claim).toEqual({ medianDeposit: 4000, gotBack: 2, answered: 3 });
  });

  it(`is withheld below ${MIN_DEPOSIT_ANSWERS} answers`, () => {
    expect(MIN_DEPOSIT_ANSWERS).toBe(3);
    expect(depositClaim([ended(true, 4000, 4000), ended(false, 4000, 0)])).toBeNull();
    expect(
      depositClaim([
        ended(true, 4000, 4000),
        ended(false, 4000, 0),
        // Unanswered reports and current tenants do not reach the gate.
        ended(null, 4000),
        { source: 'user', depositAmount: 4000, depositReturned: false, isCurrentTenant: true },
      ]),
    ).toBeNull();
  });

  it('reads the tenant group only: user and import, never scraped', () => {
    const claim = depositClaim([
      ended(true, 3000, 3000, 'user'),
      ended(true, 3000, 1000, 'import'),
      ended(false, 3000, 0, 'import'),
      ended(true, 9000, 9000, 'scraped'),
      ended(true, 9000, 9000, 'scraped'),
      ended(true, 9000, 9000, 'unknown'),
    ]);

    expect(claim).toEqual({ medianDeposit: 3000, gotBack: 2, answered: 3 });
  });

  it('rounds the median deposit to hundreds and takes it over every tenant amount', () => {
    const claim = depositClaim([
      ended(true, 3140, 3140),
      ended(false, 3260, 0),
      ended(true, 3290, 3000),
      // A current tenant has no answer but its deposit is a deposit.
      { source: 'user', depositAmount: 3320, depositReturned: null, isCurrentTenant: true },
    ]);

    expect(claim).toEqual({ medianDeposit: 3300, gotBack: 2, answered: 3 });
  });

  it('reads Prisma decimals and needs a deposit amount', () => {
    const decimal = (value: number) => ({ valueOf: () => value });
    expect(
      depositClaim([
        { ...ended(true, null), depositAmount: decimal(4100) },
        { ...ended(true, null), depositAmount: decimal(4200), depositReturnedAmount: decimal(10) },
        ended(false, null),
      ]),
    ).toEqual({ medianDeposit: 4200, gotBack: 2, answered: 3 });

    expect(depositClaim([ended(true, null), ended(true, 0), ended(false, null)])).toBeNull();
  });
});
