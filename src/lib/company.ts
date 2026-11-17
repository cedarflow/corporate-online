import { all, first, newId, stmt } from './db.ts';
import { addDays } from './dates.ts';
import { scheduleForCompany } from './compliance.ts';
import { getJurisdiction } from './jurisdictions.ts';
import { buildLegalName } from './names.ts';
import type { Client, Company, ComplianceItem, Director, Officer, Resolution, ShareClass, Shareholder, ShareTx, Task } from './types.ts';

export function displayName(co: Pick<Company, 'legal_name' | 'name_type' | 'jurisdiction' | 'distinctive' | 'descriptive' | 'legal_ending' | 'corp_number'>): string {
  if (co.legal_name) return co.legal_name;
  const j = getJurisdiction(co.jurisdiction);
  if (co.name_type === 'numbered') return `Numbered company (${j?.name ?? co.jurisdiction}, number pending)`;
  return j ? buildLegalName(co, j) : co.distinctive ?? 'Unnamed company';
}

export function computeLegalName(co: Pick<Company, 'name_type' | 'jurisdiction' | 'distinctive' | 'descriptive' | 'legal_ending' | 'corp_number'>): string | null {
  const j = getJurisdiction(co.jurisdiction);
  if (!j) return null;
  if (co.name_type === 'numbered' && !co.corp_number) return null;
  return buildLegalName(co, j);
}

export async function loadCompany(db: D1Database, id: string) {
  const company = await first<Company>(db, 'SELECT * FROM companies WHERE id = ?', id);
  if (!company) return null;
  const [client, directors, officers, classes, shareholders, txs, resolutions, compliance, tasks] = await Promise.all([
    company.client_id ? first<Client>(db, 'SELECT * FROM clients WHERE id = ?', company.client_id) : Promise.resolve(null),
    all<Director>(db, 'SELECT * FROM directors WHERE company_id = ? ORDER BY ceased_on IS NOT NULL, appointed_on, name', id),
    all<Officer>(db, 'SELECT * FROM officers WHERE company_id = ? ORDER BY ceased_on IS NOT NULL, appointed_on, name', id),
    all<ShareClass>(db, 'SELECT * FROM share_classes WHERE company_id = ? ORDER BY sort, name', id),
    all<Shareholder>(db, 'SELECT * FROM shareholders WHERE company_id = ? ORDER BY name', id),
    all<ShareTx>(db, 'SELECT * FROM share_transactions WHERE company_id = ? ORDER BY tx_date, created_at', id),
    all<Resolution>(db, 'SELECT * FROM resolutions WHERE company_id = ? ORDER BY resolution_date DESC, created_at DESC', id),
    all<ComplianceItem>(db, 'SELECT * FROM compliance_items WHERE company_id = ? ORDER BY completed_on IS NOT NULL, due_date', id),
    all<Task & { assignee_name: string | null }>(db, 'SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.company_id = ? ORDER BY t.done_at IS NOT NULL, t.sort, t.created_at', id),
  ]);
  return {
    company,
    client,
    directors,
    officers,
    classes,
    shareholders,
    txs,
    resolutions,
    compliance,
    tasks,
    currentDirectors: directors.filter((d) => !d.ceased_on),
    currentOfficers: officers.filter((o) => !o.ceased_on),
    name: displayName(company),
    j: getJurisdiction(company.jurisdiction)!,
  };
}
export type CompanyBundle = NonNullable<Awaited<ReturnType<typeof loadCompany>>>;

/** INSERT OR IGNORE statements for the company's upcoming recurring obligations. */
export function complianceStatements(db: D1Database, co: Pick<Company, 'id' | 'jurisdiction' | 'incorporation_date' | 'fiscal_year_end' | 'status'>, today: string): D1PreparedStatement[] {
  const j = getJurisdiction(co.jurisdiction);
  if (!j || !co.incorporation_date || co.status === 'dissolved') return [];
  return scheduleForCompany(co, j, addDays(today, -90), addDays(today, 430)).map((it) =>
    stmt(db, 'INSERT OR IGNORE INTO compliance_items (id, company_id, kind, title, due_date, notes, auto) VALUES (?,?,?,?,?,?,1)', newId(), co.id, it.kind, it.title, it.due_date, it.notes),
  );
}

export const STANDARD_TASKS: Record<'incorporate' | 'import', string[]> = {
  incorporate: [
    'Confirm client identity and collect director/shareholder details',
    'Order name search (NUANS / Name Request)',
    'Prepare articles of incorporation',
    'Client review and sign-off on articles',
    'File articles with the registry and pay the government fee',
    'Save certificate & articles to the minute book',
    'Prepare organizational resolutions and by-law No. 1',
    'Issue share certificates and update registers',
    'Register for a CRA business number / program accounts',
    'File initial return / notice of directors if required',
  ],
  import: [
    'Collect existing minute book, articles and certificate',
    'Verify directors, officers and shareholders against registry profile',
    'Reconcile securities register and share certificates',
    'Confirm annual return filing history',
  ],
};
