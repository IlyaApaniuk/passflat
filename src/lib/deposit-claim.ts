// The deposit numbers of the home hero and the blog data report (spec 03
// §Marketing copy, D25). Pure: both pages pass the city's visible reports and
// render "X of N who answered got it back, fully or partly" with the median
// deposit, or nothing.

import {
  figureGroupOf,
  MIN_DEPOSIT_ANSWERS,
  summarizeDepositReturns,
  type FigureReport,
} from '@/lib/cost-figures';

/** Hundreds: the deposit is a large one-off sum, shown rounded. */
const DEPOSIT_ROUNDING_STEP = 100;

export type DepositClaimReport = Pick<
  FigureReport,
  'source' | 'depositAmount' | 'depositReturned' | 'depositReturnedAmount' | 'isCurrentTenant'
>;

export interface DepositClaim {
  /** The tenant group's median deposit, rounded to hundreds. */
  medianDeposit: number;
  /** Ended tenancies that got the deposit back, fully or partly. */
  gotBack: number;
  /** Ended tenancies that answered the deposit question. */
  answered: number;
}

/**
 * `summarizeDepositReturns` over the tenant group's reports (user + import):
 * partial returns count as "got it back, fully or partly" and current tenants
 * are not answers. Below MIN_DEPOSIT_ANSWERS answers, or without a deposit
 * amount, there is no claim.
 */
export function depositClaim(reports: DepositClaimReport[]): DepositClaim | null {
  const returns = summarizeDepositReturns(
    reports.filter((report) => figureGroupOf(report.source) === 'tenant'),
  );
  if (returns.answered < MIN_DEPOSIT_ANSWERS || returns.medianDeposit == null) return null;

  const medianDeposit =
    Math.round(returns.medianDeposit / DEPOSIT_ROUNDING_STEP) * DEPOSIT_ROUNDING_STEP;
  if (medianDeposit <= 0) return null;

  return { medianDeposit, gotBack: returns.gotBack, answered: returns.answered };
}
