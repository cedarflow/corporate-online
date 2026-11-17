/*
 * Jurisdiction rules used for validation hints and compliance scheduling.
 * These are operational defaults, not legal advice: registry rules change,
 * so verify against the registry before relying on them and update here.
 *
 * annualReturn.rule:
 *   'days'            -> due N days after the incorporation anniversary
 *   'months'          -> due N months after the anniversary
 *   'end_next_month'  -> due on the last day of the month after the anniversary month
 */
export interface Jurisdiction {
  code: string;
  name: string;
  longName: string;
  statute: string;
  registry: string;
  annualReturn: { label: string; rule: 'days' | 'months' | 'end_next_month'; amount: number };
  residentDirectorPct: number;
  requiresNuans: boolean;
  nameApprovalNote?: string;
  legalEndings: string[];
  numberedFormat: string;
  businessNameTermYears?: number;
}

export const JURISDICTIONS: Record<string, Jurisdiction> = {
  CA: {
    code: 'CA',
    name: 'Federal',
    longName: 'Canada (federal)',
    statute: 'Canada Business Corporations Act (CBCA)',
    registry: 'Corporations Canada',
    annualReturn: { label: 'Federal annual return', rule: 'days', amount: 60 },
    residentDirectorPct: 25,
    requiresNuans: true,
    legalEndings: ['Inc.', 'Incorporated', 'Corp.', 'Corporation', 'Ltd.', 'Limited', 'Ltée', 'Limitée', 'Incorporée', 'Société par actions de régime fédéral', 'S.A.R.F.'],
    numberedFormat: '{number} Canada Inc.',
  },
  ON: {
    code: 'ON',
    name: 'Ontario',
    longName: 'Ontario',
    statute: 'Business Corporations Act (Ontario) (OBCA)',
    registry: 'Ontario Business Registry',
    annualReturn: { label: 'Ontario annual return', rule: 'days', amount: 60 },
    residentDirectorPct: 0,
    requiresNuans: true,
    legalEndings: ['Inc.', 'Incorporated', 'Corp.', 'Corporation', 'Ltd.', 'Limited', 'Ltée', 'Limitée', 'Incorporée'],
    numberedFormat: '{number} Ontario Inc.',
    businessNameTermYears: 5,
  },
  BC: {
    code: 'BC',
    name: 'British Columbia',
    longName: 'British Columbia',
    statute: 'Business Corporations Act (British Columbia) (BCBCA)',
    registry: 'BC Registries and Online Services',
    annualReturn: { label: 'BC annual report', rule: 'months', amount: 2 },
    residentDirectorPct: 0,
    requiresNuans: false,
    nameApprovalNote: 'BC uses its own Name Request (NR) instead of NUANS.',
    legalEndings: ['Inc.', 'Incorporated', 'Corp.', 'Corporation', 'Ltd.', 'Limited', 'Ltée', 'Limitée', 'Incorporée'],
    numberedFormat: '{number} B.C. Ltd.',
  },
  AB: {
    code: 'AB',
    name: 'Alberta',
    longName: 'Alberta',
    statute: 'Business Corporations Act (Alberta) (ABCA)',
    registry: 'Alberta Corporate Registry',
    annualReturn: { label: 'Alberta annual return', rule: 'end_next_month', amount: 1 },
    residentDirectorPct: 0,
    requiresNuans: true,
    legalEndings: ['Inc.', 'Incorporated', 'Corp.', 'Corporation', 'Ltd.', 'Limited'],
    numberedFormat: '{number} Alberta Ltd.',
  },
};

export function getJurisdiction(code: string | null | undefined): Jurisdiction | null {
  return (code && JURISDICTIONS[code]) || null;
}
export function jurisdictionList(): Jurisdiction[] {
  return Object.values(JURISDICTIONS);
}
