// All dates are ISO "YYYY-MM-DD" strings, computed in UTC to avoid DST drift.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function parse(d: string): Date {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}
export function isIso(d: unknown): d is string {
  if (typeof d !== 'string' || !ISO.test(d)) return false;
  const x = parse(d);
  return !Number.isNaN(x.getTime()) && fmt(x) === d;
}
export function fmt(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}
/** Today's date in Toronto (the firm's working timezone). */
export function today(tz = 'America/Toronto'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}
export function addDays(d: string, n: number): string {
  const x = parse(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fmt(x);
}
function lastDay(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
export function addMonths(d: string, n: number): string {
  const x = parse(d);
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + n);
  x.setUTCDate(Math.min(day, lastDay(x.getUTCFullYear(), x.getUTCMonth())));
  return fmt(x);
}
export function endOfMonth(d: string): string {
  const x = parse(d);
  return fmt(new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), lastDay(x.getUTCFullYear(), x.getUTCMonth()))));
}
/** Anniversary of `d` in `year`; Feb 29 falls back to Feb 28 in non-leap years. */
export function anniversary(d: string, year: number): string {
  const [, m, dd] = d.split('-').map(Number);
  const day = Math.min(dd, lastDay(year, m - 1));
  return `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}
export function human(d?: string | null): string {
  if (!d) return '';
  return parse(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
export function short(d?: string | null): string {
  if (!d) return '';
  return parse(d).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
/** "MM-DD" fiscal year end -> "March 31" */
export function fyeLabel(fye?: string | null): string {
  if (!fye) return '';
  return human(`2001-${fye}`).replace(/,? 2001/, '');
}
