import { parse } from './dates.ts';

/** Whole calendar months from `start` to `asOf` (a month counts once its day-of-month is reached). */
export function monthsBetween(start: string, asOf: string): number {
  const a = parse(start), b = parse(asOf);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return Math.max(0, m);
}

/** Options vested as of a date: nothing before the cliff, then monthly straight-line. */
export function vestedQuantity(g: { quantity: number; vesting_start: string | null; grant_date: string; vesting_months: number; cliff_months: number }, asOf: string): number {
  const start = g.vesting_start || g.grant_date;
  if (asOf < start) return 0;
  if (g.vesting_months <= 0) return g.quantity;
  const m = monthsBetween(start, asOf);
  if (m < g.cliff_months) return 0;
  return Math.min(g.quantity, Math.floor((g.quantity * m) / g.vesting_months));
}
