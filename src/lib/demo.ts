// Sample data for exploring the app. Dates are relative to today so the demo stays current.
import { batch, newId, stmt } from './db.ts';
import { addDays, addMonths, today } from './dates.ts';
import { complianceStatements, STANDARD_TASKS } from './company.ts';
import { getJurisdiction } from './jurisdictions.ts';
import { buildLegalName } from './names.ts';

interface DemoCo {
  client: string;
  jurisdiction: string;
  name_type: 'named' | 'numbered';
  distinctive?: string;
  descriptive?: string;
  legal_ending?: string;
  corp_number?: string;
  status: string;
  inc?: string;
  fye: string;
  office: string;
  activity: string;
  directors: [string, boolean][];
  holders: [string, number, number][]; // name, shares, price
  standard?: boolean;
}

export async function loadDemoData(db: D1Database, userId: string) {
  const t = today();
  const clients: Record<string, string> = {};
  const s: D1PreparedStatement[] = [];
  for (const [name, email, phone] of [
    ['Priya Raman', 'priya@example.com', '416-555-0142'],
    ['Daniel & Sophie Tremblay', 'tremblay@example.com', '613-555-0199'],
    ['Westcoast Holdings Group', 'admin@example.com', '604-555-0111'],
    ['Marcus Chen', 'marcus@example.com', '647-555-0177'],
  ]) {
    clients[name] = newId();
    s.push(stmt(db, 'INSERT INTO clients (id, name, email, phone, owner_id) VALUES (?,?,?,?,?)', clients[name], name, email, phone, userId));
  }

  const cos: DemoCo[] = [
    { client: 'Priya Raman', jurisdiction: 'ON', name_type: 'named', distinctive: 'Northern Cedar', descriptive: 'Consulting', legal_ending: 'Inc.', corp_number: '1000482913', status: 'active', inc: addMonths(t, -32), fye: '12-31', office: '120 Adelaide Street West, Suite 2500\nToronto, Ontario M5H 1T1', activity: 'IT and management consulting', directors: [['Priya Raman', true], ['Arjun Raman', true]], holders: [['Priya Raman', 60, 1], ['Arjun Raman', 40, 1]], standard: true },
    { client: 'Daniel & Sophie Tremblay', jurisdiction: 'CA', name_type: 'named', distinctive: 'Maple Ridge', descriptive: 'Bakery', legal_ending: 'Ltd.', corp_number: '1534221-7', status: 'active', inc: addDays(addMonths(t, -12), -45), fye: '09-30', office: '45 Rideau Street\nOttawa, Ontario K1N 5W8', activity: 'Retail bakery and café', directors: [['Daniel Tremblay', true], ['Sophie Tremblay', true]], holders: [['Daniel Tremblay', 50, 10], ['Sophie Tremblay', 50, 10]] },
    { client: 'Westcoast Holdings Group', jurisdiction: 'BC', name_type: 'numbered', corp_number: 'BC1428870', status: 'active', inc: addDays(addMonths(t, -24), -70), fye: '06-30', office: '1055 West Georgia Street, Suite 1500\nVancouver, BC V6E 4N7', activity: 'Holding company', directors: [['Elena Petrova', false]], holders: [['Westcoast Holdings Group', 1, 100]] },
    { client: 'Marcus Chen', jurisdiction: 'CA', name_type: 'named', distinctive: 'Lakeshore', descriptive: 'Robotics', legal_ending: 'Inc.', status: 'name_review', fye: '12-31', office: '200 University Avenue\nToronto, Ontario M5H 3C6', activity: 'Industrial automation hardware', directors: [['Marcus Chen', true]], holders: [['Marcus Chen', 1000, 0.01]] },
  ];

  for (const d of cos) {
    const j = getJurisdiction(d.jurisdiction)!;
    const id = newId();
    const legal = buildLegalName({ name_type: d.name_type, distinctive: d.distinctive, descriptive: d.descriptive, legal_ending: d.legal_ending, corp_number: d.corp_number }, j);
    s.push(stmt(db, `INSERT INTO companies (id, client_id, name_type, distinctive, descriptive, legal_ending, legal_name, jurisdiction, corp_number, status, incorporation_date, fiscal_year_end, registered_office, business_activity, restrictions, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, clients[d.client], d.name_type, d.distinctive, d.descriptive, d.legal_ending, legal, d.jurisdiction, d.corp_number, d.status, d.inc, d.fye, d.office, d.activity,
      'Share transfers require approval of the directors.', userId));
    for (const [name, res] of d.directors) s.push(stmt(db, 'INSERT INTO directors (id, company_id, name, resident_canadian, appointed_on) VALUES (?,?,?,?,?)', newId(), id, name, res, d.inc));
    s.push(stmt(db, 'INSERT INTO officers (id, company_id, name, title, appointed_on) VALUES (?,?,?,?,?)', newId(), id, d.directors[0][0], 'President', d.inc));
    s.push(stmt(db, 'INSERT INTO officers (id, company_id, name, title, appointed_on) VALUES (?,?,?,?,?)', newId(), id, d.directors.at(-1)![0], 'Secretary', d.inc));
    const classA = newId();
    s.push(stmt(db, "INSERT INTO share_classes (id, company_id, name, voting, participating, rights, sort) VALUES (?,?,'Class A Common',1,1,'Voting; participating; dividends at the discretion of the directors.',0)", classA, id));
    if (d.standard) {
      s.push(stmt(db, "INSERT INTO share_classes (id, company_id, name, voting, participating, rights, sort) VALUES (?,?,'Class B Common',0,1,'Non-voting; participating; discretionary dividends.',1)", newId(), id));
      s.push(stmt(db, "INSERT INTO share_classes (id, company_id, name, voting, participating, rights, sort) VALUES (?,?,'Class C Preferred',0,0,'Non-voting; redeemable and retractable; discretionary non-cumulative dividends.',2)", newId(), id));
    }
    d.holders.forEach(([name, qty, price], i) => {
      const sh = newId();
      s.push(stmt(db, 'INSERT INTO shareholders (id, company_id, name, kind) VALUES (?,?,?,?)', sh, id, name, name.includes('Group') ? 'corporation' : 'individual'));
      if (d.inc) s.push(stmt(db, "INSERT INTO share_transactions (id, company_id, share_class_id, kind, to_shareholder_id, quantity, price_per_share, tx_date, certificate_number) VALUES (?,?,?,'issuance',?,?,?,?,?)", newId(), id, classA, sh, qty, price, d.inc, `A-${i + 1}`));
    });
    const mode = d.inc ? 'import' : 'incorporate';
    STANDARD_TASKS[mode].forEach((title, i) => s.push(stmt(db, 'INSERT INTO tasks (id, company_id, title, sort, created_by, done_at) VALUES (?,?,?,?,?,?)', newId(), id, title, i, userId, mode === 'incorporate' && i < 1 ? t : d.inc ? t : null)));
    if (d.inc) {
      s.push(stmt(db, "INSERT INTO resolutions (id, company_id, kind, body_type, title, body, resolution_date, signed_on, created_by) VALUES (?,?,'org_directors','directors','Organizational resolutions of the directors',?,?,?,?)",
        newId(), id, `RESOLUTIONS OF THE DIRECTORS OF ${legal.toUpperCase()}\n\nBE IT RESOLVED THAT:\n\n1. By-law No. 1 is made as a by-law of the Corporation.\n\n2. The subscriptions for shares set out in the securities register are accepted and the shares issued as fully paid.\n\n3. ${d.directors[0][0]} is appointed President.`, d.inc, d.inc, userId));
      s.push(...complianceStatements(db, { id, jurisdiction: d.jurisdiction, incorporation_date: d.inc, fiscal_year_end: d.fye, status: d.status }, t));
    }
    s.push(stmt(db, 'INSERT INTO activity (id, user_id, company_id, client_id, message) VALUES (?,?,?,?,?)', newId(), userId, id, clients[d.client], `${d.inc ? 'Imported' : 'Opened incorporation file for'} ${legal}`));
  }

  const bn = newId();
  const reg = addDays(addMonths(t, -60), 20);
  const exp = addDays(addMonths(reg, 60), -1);
  s.push(stmt(db, "INSERT INTO business_names (id, client_id, name, jurisdiction, registration_number, registered_on, expires_on, activity, status) VALUES (?,?,'Sunrise Cleaning Services','ON','300987654',?,?,'Residential cleaning','active')", bn, clients['Marcus Chen'], reg, exp));
  s.push(stmt(db, "INSERT INTO compliance_items (id, business_name_id, kind, title, due_date, auto) VALUES (?,?,'bn_renewal','Renew business name: Sunrise Cleaning Services',?,1)", newId(), bn, exp));

  await batch(db, s);
}
