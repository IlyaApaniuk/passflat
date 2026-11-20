/**
 * The roommate matching switch (spec 07 §Switch, FR-23, D49).
 *
 * Stage 2 (cards, interest, reveals, the daily push, the one-time message) runs only while
 * `ROOMMATE_MATCHING_ENABLED` is exactly `'true'`; any other value or unset is off. The variable
 * is read on every call (per request and per cron run), never cached at module load. On Vercel a
 * changed value applies only to a new deployment: turning the switch is "set the variable, then
 * redeploy" (owner step).
 */
export function isMatchingEnabled(): boolean {
  return process.env.ROOMMATE_MATCHING_ENABLED === 'true';
}
