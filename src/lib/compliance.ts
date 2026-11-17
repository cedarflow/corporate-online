import { addDays, addMonths, anniversary, daysBetween, endOfMonth, parse } from './dates.ts';
import type { Jurisdiction } from './jurisdictions.ts';

export interface ComplianceSpec { kind: string; title: string; due_date: string; notes?: string }

export function annualReturnDue(incorporationDate: string, j: Jurisdiction, year: number): string {
  const anniv = anniversary(incorporationDate, year);
  const r = j.annualReturn;
  if (r.rule === 'days') return addDays(anniv, r.amount);
  if (r.rule === 'months') return addMonths(anniv, r.amount);
  return endOfMonth(addMonths(anniv, 1));
}

/** First fiscal year end on or after the incorporation date (FYE is "MM-DD"). */
export function firstFiscalYearEnd(incorporationDate: string, fye: string): string {
  const y = parse(incorporationDate).getUTCFullYear();
  const candidate = anniversary(`2000-${fye}`, y);
  return candidate >= incorporationDate ? candidate : anniversary(`2000-${fye}`, y + 1);
}

/**
 * Recurring obligations for a corporation whose due dates fall within [from, to].
 * Annual returns follow the incorporation anniversary; annual resolutions and
 * CRA deadlines follow the fiscal year end.
 */
export function scheduleForCompany(
  c: { incorporation_date: string | null; fiscal_year_end: string | null },
  j: Jurisdiction,
  from: string,
  to: string,
): ComplianceSpec[] {
  const out: ComplianceSpec[] = [];
  if (!c.incorporation_date) return out;
  const incYear = parse(c.incorporation_date).getUTCFullYear();
  const lastYear = parse(to).getUTCFullYear();

  for (let y = incYear + 1; y <= lastYear; y++) {
    const due = annualReturnDue(c.incorporation_date, j, y);
    if (due >= from && due <= to) {
      out.push({ kind: 'annual_return', title: `${j.annualReturn.label} (${y})`, due_date: due, notes: `Filed with ${j.registry}.` });
    }
  }

  if (c.fiscal_year_end) {
    let fyeDate = firstFiscalYearEnd(c.incorporation_date, c.fiscal_year_end);
    while (fyeDate <= to) {
      const fy = parse(fyeDate).getUTCFullYear();
      const items: ComplianceSpec[] = [
        { kind: 'tax_balance', title: `Corporate tax balance due, FY${fy} (CRA)`, due_date: addMonths(fyeDate, 2), notes: '2 months after year end; 3 months for eligible CCPCs.' },
        { kind: 't2_return', title: `T2 corporate income tax return, FY${fy} (CRA)`, due_date: addMonths(fyeDate, 6) },
        { kind: 'annual_resolutions', title: `Annual resolutions, FY${fy} (approve financials, elect directors)`, due_date: addMonths(fyeDate, 6), notes: 'Held within 6 months of year end; update minute book.' },
      ];
      for (const it of items) if (it.due_date >= from && it.due_date <= to) out.push(it);
      fyeDate = anniversary(fyeDate, fy + 1);
    }
  }
  return out.sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export type ItemState = 'done' | 'overdue' | 'due_soon' | 'upcoming';
export function itemState(item: { due_date: string; completed_on: string | null }, today: string, soonDays = 30): ItemState {
  if (item.completed_on) return 'done';
  const d = daysBetween(today, item.due_date);
  if (d < 0) return 'overdue';
  if (d <= soonDays) return 'due_soon';
  return 'upcoming';
}
