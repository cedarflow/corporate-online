import type { Jurisdiction } from './jurisdictions.ts';

export interface NameInput { name_type: 'named' | 'numbered'; distinctive?: string | null; descriptive?: string | null; legal_ending?: string | null; corp_number?: string | null }

export function buildLegalName(n: NameInput, j: Jurisdiction): string {
  if (n.name_type === 'numbered') {
    // Registry numbers may carry a prefix or check digit (e.g. "BC1234567", "1234567-8"); the name uses the bare number.
    const num = n.corp_number?.match(/\d+/)?.[0];
    return num ? j.numberedFormat.replace('{number}', num) : `(numbered) ${j.numberedFormat.replace('{number} ', '').trim()}`;
  }
  return [n.distinctive, n.descriptive, n.legal_ending].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');
}

// Words that registries restrict or that need consent/approval. Not exhaustive.
const RESTRICTED = ['bank', 'banking', 'trust', 'insurance', 'university', 'college', 'engineering', 'engineer', 'architect', 'cpa', 'accountant', 'lawyer', 'law', 'legal', 'notary', 'royal', 'crown', 'government', 'federal', 'parliament', 'cooperative', 'co-operative', 'credit union', 'red cross', 'olympic', 'rcmp', 'nurse', 'medical', 'pharmacy', 'veterinary'];
const GENERIC = ['consulting', 'services', 'solutions', 'holdings', 'enterprises', 'group', 'management', 'ventures', 'investments', 'technologies', 'tech', 'global', 'international', 'canada', 'ontario'];

export interface NameCheck { errors: string[]; warnings: string[] }

export function checkName(n: NameInput, j: Jurisdiction): NameCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (n.name_type === 'numbered') {
    if (n.legal_ending) warnings.push('Numbered companies use the registry-assigned format; the legal ending is ignored.');
    return { errors, warnings };
  }
  const distinctive = (n.distinctive ?? '').trim();
  const descriptive = (n.descriptive ?? '').trim();
  if (!distinctive) errors.push('A named corporation needs a distinctive element (e.g. "Maple Leaf").');
  if (!n.legal_ending || !j.legalEndings.includes(n.legal_ending)) errors.push(`Choose a legal ending accepted in ${j.longName}.`);
  const full = `${distinctive} ${descriptive}`.toLowerCase();
  if (distinctive && GENERIC.includes(distinctive.toLowerCase())) warnings.push(`"${distinctive}" is too generic to be distinctive on its own; registries usually reject it.`);
  if (!descriptive) warnings.push('No descriptive element: registries generally expect one (e.g. "Consulting", "Bakery").');
  for (const w of RESTRICTED) {
    if (new RegExp(`\\b${w.replace(/[-]/g, '\\-')}\\b`).test(full)) warnings.push(`"${w}" is a restricted/regulated term and may need consent or approval.`);
  }
  const len = buildLegalName(n, j).length;
  if (len > 120) errors.push('Name is too long (max 120 characters).');
  if (/[^\p{L}\p{N}\s&'.,\-!?()@#/:]/u.test(full)) warnings.push('Name contains unusual characters that a registry may not accept.');
  if (j.requiresNuans) warnings.push(`A NUANS report (valid 90 days) is required before filing in ${j.longName}.`);
  else if (j.nameApprovalNote) warnings.push(j.nameApprovalNote);
  return { errors, warnings };
}

/** Normalise a name for duplicate detection: drop legal endings, punctuation, case. */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|incorporated|corp|corporation|ltd|limited|ltée|limitée|incorporée|s\.a\.r\.f)\b\.?/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function similarNames(candidate: string, existing: { id: string; legal_name: string | null }[]): { id: string; legal_name: string }[] {
  const c = normaliseName(candidate);
  if (!c) return [];
  return existing.filter((e): e is { id: string; legal_name: string } => {
    if (!e.legal_name) return false;
    const n = normaliseName(e.legal_name);
    return n === c || (n.length > 3 && (n.includes(c) || c.includes(n)));
  });
}
