import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, logStmt, newId, run, stmt } from '../lib/db.ts';
import { fyeLabel, isIso, today } from '../lib/dates.ts';
import { getJurisdiction, jurisdictionList, JURISDICTIONS } from '../lib/jurisdictions.ts';
import { STATUSES, STATUS_CODES, statusIndex, statusLabel } from '../lib/statuses.ts';
import { checkName, similarNames } from '../lib/names.ts';
import { capTable } from '../lib/captable.ts';
import { TEMPLATES } from '../lib/resolutions.ts';
import { STANDARD_TASKS, complianceStatements, computeLegalName, displayName, loadCompany, type CompanyBundle } from '../lib/company.ts';
import type { Client, Company, User } from '../lib/types.ts';
import { arr, int, readForm, redirect, s } from '../http.ts';
import { Area, D, DueBadge, Empty, Field, Page, Post, Select, StatusBadge } from '../views/layout.tsx';
import { ActivityTab, FilesTab, FinancingTab, IscSection, TeamTab } from './extras.tsx';

const app = new Hono<AppEnv>();

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ALL_ENDINGS = [...new Set(jurisdictionList().flatMap((j) => j.legalEndings))];

export const SHARE_STRUCTURES: Record<string, { label: string; classes: { name: string; voting: number; participating: number; rights: string }[] }> = {
  simple: {
    label: 'Simple: one class of common shares',
    classes: [{ name: 'Class A Common', voting: 1, participating: 1, rights: 'Voting (one vote per share); entitled to dividends as and when declared and to receive the remaining property of the Corporation on dissolution.' }],
  },
  standard: {
    label: 'Flexible: voting common, non-voting common, preferred',
    classes: [
      { name: 'Class A Common', voting: 1, participating: 1, rights: 'Voting (one vote per share); dividends at the discretion of the directors; participating in remaining property on dissolution.' },
      { name: 'Class B Common', voting: 0, participating: 1, rights: 'Non-voting; dividends at the discretion of the directors independently of other classes; participating in remaining property on dissolution.' },
      { name: 'Class C Preferred', voting: 0, participating: 0, rights: 'Non-voting; discretionary non-cumulative dividends; redeemable and retractable at the redemption amount; priority over common shares on dissolution.' },
    ],
  },
};

function fyeFrom(month: string, day: string): string | null {
  const m = Number(month), d = Number(day);
  if (!m || !d || m < 1 || m > 12) return null;
  const max = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return `${String(m).padStart(2, '0')}-${String(Math.min(d, max)).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- list
app.get('/', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const status = c.req.query('status') ?? '';
  const jur = c.req.query('jurisdiction') ?? '';
  const where: string[] = [];
  const params: string[] = [];
  if (q) { where.push('(co.legal_name LIKE ? OR co.distinctive LIKE ? OR co.corp_number LIKE ? OR cl.name LIKE ?)'); params.push(...Array(4).fill(`%${q}%`)); }
  if (status === 'in_progress') where.push("co.status IN ('draft','name_review','ready_to_file','filed')");
  else if (STATUS_CODES.includes(status)) { where.push('co.status = ?'); params.push(status); }
  if (JURISDICTIONS[jur]) { where.push('co.jurisdiction = ?'); params.push(jur); }
  const rows = await all<Company & { client_name: string | null; next_due: string | null; overdue: number }>(c.env.DB, `
    SELECT co.*, cl.name AS client_name,
      (SELECT MIN(due_date) FROM compliance_items ci WHERE ci.company_id = co.id AND ci.completed_on IS NULL) AS next_due,
      (SELECT COUNT(*) FROM compliance_items ci WHERE ci.company_id = co.id AND ci.completed_on IS NULL AND ci.due_date < ?) AS overdue
    FROM companies co LEFT JOIN clients cl ON cl.id = co.client_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY co.updated_at DESC LIMIT 500`, today(), ...params);

  return Page(c, {
    title: 'Companies',
    actions: <><a class="btn" href="/companies/new?mode=import">Import existing</a><a class="btn primary" href="/companies/new">Start incorporation</a></>,
    children: (
      <>
        <form class="filters" method="get">
          <input name="q" value={q} placeholder="Search name, number or client" />
          <select name="status">
            <option value="">All statuses</option>
            <option value="in_progress" selected={status === 'in_progress'}>In progress</option>
            {STATUSES.map((st) => <option value={st.code} selected={st.code === status}>{st.label}</option>)}
          </select>
          <select name="jurisdiction">
            <option value="">All jurisdictions</option>
            {jurisdictionList().map((j) => <option value={j.code} selected={j.code === jur}>{j.name}</option>)}
          </select>
          <button class="btn">Filter</button>
        </form>
        <div class="card flush">
          {rows.length ? (
            <table>
              <thead><tr><th>Company</th><th>Client</th><th>Jurisdiction</th><th>Status</th><th>Incorporated</th><th>Next deadline</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr>
                    <td><a href={`/companies/${r.id}`}><strong>{displayName(r)}</strong></a>{r.corp_number ? <div class="small muted mono">#{r.corp_number}</div> : null}</td>
                    <td>{r.client_id ? <a href={`/clients/${r.client_id}`}>{r.client_name}</a> : <span class="muted">—</span>}</td>
                    <td>{getJurisdiction(r.jurisdiction)?.name ?? r.jurisdiction}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td><D d={r.incorporation_date} /></td>
                    <td>{r.overdue ? <span class="badge b-bad">{r.overdue} overdue</span> : <D d={r.next_due} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No companies match. <a href="/companies/new">Start an incorporation</a>.</Empty>}
        </div>
      </>
    ),
  });
});

// ---------------------------------------------------------------- live name check (HTML fragment)
app.get('/name-check', async (c) => {
  const j = getJurisdiction(c.req.query('jurisdiction')) ?? JURISDICTIONS.CA;
  const input = {
    name_type: (c.req.query('name_type') === 'numbered' ? 'numbered' : 'named') as 'named' | 'numbered',
    distinctive: c.req.query('distinctive'),
    descriptive: c.req.query('descriptive'),
    legal_ending: c.req.query('legal_ending'),
  };
  const res = checkName(input, j);
  const preview = input.name_type === 'numbered' ? j.numberedFormat.replace('{number}', '1234567') : computeLegalName({ ...input, jurisdiction: j.code, corp_number: null } as Company) || '…';
  let dupes: { id: string; legal_name: string }[] = [];
  if (input.name_type === 'named' && input.distinctive) {
    const existing = await all<{ id: string; legal_name: string | null }>(c.env.DB, 'SELECT id, legal_name FROM companies WHERE legal_name IS NOT NULL');
    dupes = similarNames(preview, existing);
  }
  return c.html(
    <div class="namecheck">
      <div class="preview-name">{preview}{input.name_type === 'numbered' ? <span class="small muted" style="font-weight:400"> (number assigned on filing)</span> : null}</div>
      {res.errors.length ? <div class="alert bad"><ul>{res.errors.map((e) => <li>{e}</li>)}</ul></div> : null}
      {dupes.length ? <div class="alert bad">Similar to existing companies in this system: {dupes.map((d, i) => <>{i ? ', ' : ''}<a href={`/companies/${d.id}`}>{d.legal_name}</a></>)}</div> : null}
      {res.warnings.length ? <div class="alert warn"><ul>{res.warnings.map((e) => <li>{e}</li>)}</ul></div> : null}
      {!res.errors.length && !dupes.length && input.name_type === 'named' && input.distinctive ? <div class="alert info">No conflicts found internally. Confirm with an official name search before filing.</div> : null}
    </div>,
  );
});

// ---------------------------------------------------------------- new (wizard)
const DirectorRow = () => (
  <div class="rowitem">
    <button class="btn sm link rm" data-remove-row>Remove</button>
    <div class="fields">
      <div><label>Full legal name</label><input name="dir_name" data-req required /></div>
      <div><label>Email</label><input name="dir_email" type="email" /></div>
      <div><label>Residential address</label><input name="dir_address" /></div>
      <div><label>Resident Canadian?</label><select name="dir_resident"><option value="1">Yes</option><option value="0">No</option></select></div>
    </div>
  </div>
);
const ShareholderRow = () => (
  <div class="rowitem">
    <button class="btn sm link rm" data-remove-row>Remove</button>
    <div class="fields">
      <div><label>Shareholder name</label><input name="sh_name" /></div>
      <div><label>Type</label><select name="sh_kind"><option value="individual">Individual</option><option value="corporation">Corporation</option><option value="trust">Trust</option></select></div>
      <div><label>Email</label><input name="sh_email" type="email" /></div>
      <div><label>Class A shares</label><input name="sh_qty" type="number" min="0" step="1" value="100" /></div>
      <div><label>Price per share ($)</label><input name="sh_price" type="number" min="0" step="0.0001" value="1.00" /></div>
    </div>
  </div>
);

app.get('/new', async (c) => {
  const mode = c.req.query('mode') === 'import' ? 'import' : 'incorporate';
  const clients = await all<Client>(c.env.DB, 'SELECT id, name FROM clients ORDER BY name');
  const preClient = c.req.query('client') ?? '';
  return Page(c, {
    title: mode === 'import' ? 'Import an existing corporation' : 'Start an incorporation',
    crumbs: [['Companies', '/companies'], ['New']],
    children: (
      <form method="post" action="/companies" data-wizard data-name-preview class="card">
        <div class="steps">
          {['Client & jurisdiction', 'Name', 'Details', 'Directors', 'Shares', 'Review'].map((l, i) => <button type="button">{i + 1}. {l}</button>)}
        </div>

        <section class="step">
          <h2>Client & jurisdiction</h2>
          <div class="fields" style="margin-bottom:12px">
            <div>
              <label>This is</label>
              <label class="check"><input type="radio" name="mode" value="incorporate" checked={mode === 'incorporate'} /> A new incorporation</label>
              <label class="check"><input type="radio" name="mode" value="import" checked={mode === 'import'} /> An existing corporation (import records)</label>
            </div>
            <Select label="Jurisdiction" name="jurisdiction" value="CA" options={jurisdictionList().map((j) => [j.code, `${j.longName} (${j.statute.match(/\(([^)]+)\)$/)?.[1] ?? ''})`])} />
          </div>
          <div class="fields">
            <Select label="Client" name="client_id" value={preClient} blank="+ Create a new client" options={clients.map((cl) => [cl.id, cl.name])} />
          </div>
          <div data-show-when="client_id=" style="margin-top:12px">
            <div class="fields">
              <div><label>New client name</label><input name="client_name" data-req placeholder="Person or organization" /></div>
              <Field label="Client email" name="client_email" type="email" />
              <Field label="Client phone" name="client_phone" />
            </div>
          </div>
          <div class="row" style="margin-top:16px"><button class="btn primary" data-next>Next</button></div>
        </section>

        <section class="step">
          <h2>Corporate name</h2>
          <div data-show-when="mode=incorporate">
            <div class="row" style="margin-bottom:12px">
              <label class="check"><input type="radio" name="name_type" value="named" checked /> Named company</label>
              <label class="check"><input type="radio" name="name_type" value="numbered" /> Numbered company</label>
            </div>
            <div data-show-when="name_type=named" class="fields">
              <Field label="Distinctive element" name="distinctive" placeholder="e.g. Northern Cedar" hint="unique part" />
              <Field label="Descriptive element" name="descriptive" placeholder="e.g. Consulting" hint="what the business does" />
              <Select label="Legal ending" name="legal_ending" value="Inc." options={ALL_ENDINGS.map((e) => [e, e])} />
            </div>
            <div id="name-check" style="margin-top:12px"></div>
          </div>
          <div data-show-when="mode=import" class="fields">
            <div><label>Exact legal name</label><input name="import_legal_name" data-req placeholder="As shown on the certificate" /></div>
            <div><label>Corporation number</label><input name="import_corp_number" /></div>
            <div><label>Date of incorporation</label><input name="import_inc_date" type="date" data-req /></div>
            <Field label="Business number (BN)" name="import_bn" />
          </div>
          <div class="row" style="margin-top:16px"><button class="btn" data-prev>Back</button><button class="btn primary" data-next>Next</button></div>
        </section>

        <section class="step">
          <h2>Company details</h2>
          <div class="fields">
            <Area label="Registered office address" name="registered_office" hint="must be in the jurisdiction" />
            <Area label="Mailing address" name="mailing_address" hint="if different" />
          </div>
          <div class="fields" style="margin-top:12px">
            <div>
              <label>Fiscal year end</label>
              <div class="row">
                <select name="fye_month" style="width:60%">{MONTHS.map((m, i) => <option value={String(i + 1)} selected={i === 11}>{m}</option>)}</select>
                <input name="fye_day" type="number" min="1" max="31" value="31" style="width:35%" />
              </div>
            </div>
            <Field label="Principal business activity" name="business_activity" placeholder="e.g. IT consulting services" />
            <Field label="NUANS / Name Request #" name="nuans_number" />
            <Field label="Minimum directors" name="min_directors" type="number" value="1" />
            <Field label="Maximum directors" name="max_directors" type="number" value="10" />
          </div>
          <div style="margin-top:12px"><Area label="Restrictions on business / share transfers" name="restrictions" value="None on business. Share transfers require approval of the directors (private issuer restrictions)." /></div>
          <label class="check" style="margin-top:8px"><input type="checkbox" name="uncertificated" value="1" /> Shares will be uncertificated (holders get a written notice instead of a certificate; common for BC companies)</label>
          <div class="row" style="margin-top:16px"><button class="btn" data-prev>Back</button><button class="btn primary" data-next>Next</button></div>
        </section>

        <section class="step">
          <h2>Directors</h2>
          <p class="muted small">Federal corporations: at least 25% of directors should be resident Canadians (check current rules). Ontario, BC and Alberta have no residency requirement.</p>
          <div class="rows" id="directors"><DirectorRow /></div>
          <template id="directors-tpl"><DirectorRow /></template>
          <button class="btn sm" data-add-row="directors">+ Add director</button>
          <div style="margin-top:14px"><label class="check"><input type="checkbox" name="first_director_officer" value="1" checked /> Appoint the first director as President and Secretary</label></div>
          <div class="row" style="margin-top:16px"><button class="btn" data-prev>Back</button><button class="btn primary" data-next>Next</button></div>
        </section>

        <section class="step">
          <h2>Share structure & initial shareholders</h2>
          <div class="fields" style="margin-bottom:12px">
            <Select label="Authorized share structure" name="share_structure" value="simple" options={Object.entries(SHARE_STRUCTURES).map(([k, v]) => [k, v.label])} />
          </div>
          <p class="muted small">Initial shareholders receive Class A shares, dated to the incorporation date once it's known. You can add more classes, transfers and issuances later.</p>
          <div class="rows" id="shareholders"><ShareholderRow /></div>
          <template id="shareholders-tpl"><ShareholderRow /></template>
          <button class="btn sm" data-add-row="shareholders">+ Add shareholder</button>
          <div class="row" style="margin-top:16px"><button class="btn" data-prev>Back</button><button class="btn primary" data-next>Next</button></div>
        </section>

        <section class="step">
          <h2>Review & create</h2>
          <p class="muted">Creating the file sets up the minute book (registers, share ledger), a checklist of tasks, and the compliance calendar once the company is incorporated.</p>
          <Area label="Internal notes" name="notes" />
          <div class="row" style="margin-top:16px"><button class="btn" data-prev>Back</button><button class="btn primary" type="submit">Create company file</button></div>
        </section>
      </form>
    ),
  });
});

// ---------------------------------------------------------------- create
app.post('/', async (c) => {
  const db = c.env.DB;
  const user = c.get('user');
  const f = await readForm(c);
  const mode = s(f.mode) === 'import' ? 'import' : 'incorporate';
  const j = getJurisdiction(s(f.jurisdiction));
  if (!j) return redirect(c, '/companies/new', 'error', 'Choose a jurisdiction.');

  const nameType = mode === 'import' ? 'named' : s(f.name_type) === 'numbered' ? 'numbered' : 'named';
  const co = {
    id: newId(),
    name_type: nameType as 'named' | 'numbered',
    distinctive: mode === 'import' ? s(f.import_legal_name) : s(f.distinctive),
    descriptive: mode === 'import' ? '' : s(f.descriptive),
    legal_ending: mode === 'import' ? '' : s(f.legal_ending),
    corp_number: mode === 'import' ? s(f.import_corp_number) : '',
    jurisdiction: j.code,
  };
  if (mode === 'incorporate' && nameType === 'named') {
    const chk = checkName(co, j);
    if (chk.errors.length) return redirect(c, '/companies/new', 'error', chk.errors.join(' '));
  }
  if (mode === 'import' && (!co.distinctive || !isIso(s(f.import_inc_date)))) return redirect(c, '/companies/new?mode=import', 'error', 'Legal name and a valid incorporation date are required.');

  const stmts: D1PreparedStatement[] = [];
  let clientId = s(f.client_id);
  if (!clientId) {
    if (!s(f.client_name)) return redirect(c, '/companies/new', 'error', 'Choose a client or enter a new client name.');
    clientId = newId();
    stmts.push(stmt(db, 'INSERT INTO clients (id, name, email, phone, owner_id) VALUES (?,?,?,?,?)', clientId, s(f.client_name), s(f.client_email), s(f.client_phone), user.id));
  } else if (!(await first(db, 'SELECT id FROM clients WHERE id = ?', clientId))) {
    return redirect(c, '/companies/new', 'error', 'That client no longer exists.');
  }

  const incDate = mode === 'import' ? s(f.import_inc_date) : null;
  const status = mode === 'import' ? 'active' : 'draft';
  const legalName = mode === 'import' ? co.distinctive : computeLegalName(co);
  const fye = fyeFrom(s(f.fye_month), s(f.fye_day));
  stmts.push(stmt(db, `INSERT INTO companies (id, client_id, name_type, distinctive, descriptive, legal_ending, legal_name, jurisdiction, corp_number, business_number, status, incorporation_date, fiscal_year_end, registered_office, mailing_address, nuans_number, business_activity, restrictions, min_directors, max_directors, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    co.id, clientId, co.name_type, co.distinctive, co.descriptive, co.legal_ending, legalName, j.code, co.corp_number, s(f.import_bn), status, incDate, fye,
    s(f.registered_office), s(f.mailing_address), s(f.nuans_number), s(f.business_activity), s(f.restrictions), int(f.min_directors) ?? 1, int(f.max_directors) ?? 10, s(f.notes), user.id));
  if (s(f.uncertificated) === '1') stmts.push(stmt(db, 'UPDATE companies SET uncertificated = 1 WHERE id = ?', co.id));

  // Directors
  const dn = arr(f.dir_name), de = arr(f.dir_email), da = arr(f.dir_address), dr = arr(f.dir_resident);
  const directors = dn.map((name, i) => ({ name, email: de[i], address: da[i], resident: dr[i] !== '0' })).filter((d) => d.name);
  if (!directors.length) return redirect(c, '/companies/new', 'error', 'Add at least one director.');
  for (const d of directors) stmts.push(stmt(db, 'INSERT INTO directors (id, company_id, name, email, address, resident_canadian, appointed_on) VALUES (?,?,?,?,?,?,?)', newId(), co.id, d.name, d.email, d.address, d.resident, incDate));
  if (s(f.first_director_officer)) {
    for (const title of ['President', 'Secretary']) stmts.push(stmt(db, 'INSERT INTO officers (id, company_id, name, title, appointed_on) VALUES (?,?,?,?,?)', newId(), co.id, directors[0].name, title, incDate));
  }

  // Share classes + initial issuances
  const structure = SHARE_STRUCTURES[s(f.share_structure)] ?? SHARE_STRUCTURES.simple;
  const classIds = structure.classes.map(() => newId());
  structure.classes.forEach((cl, i) => stmts.push(stmt(db, 'INSERT INTO share_classes (id, company_id, name, voting, participating, rights, sort) VALUES (?,?,?,?,?,?,?)', classIds[i], co.id, cl.name, cl.voting, cl.participating, cl.rights, i)));
  const sn = arr(f.sh_name), sk = arr(f.sh_kind), se = arr(f.sh_email), sq = arr(f.sh_qty), sp = arr(f.sh_price);
  // Pre-incorporation subscriptions are re-dated to the incorporation date when it is first recorded.
  const issueDate = incDate ?? today();
  let cert = 1;
  sn.forEach((name, i) => {
    if (!name) return;
    const shId = newId();
    const kind = ['individual', 'corporation', 'trust'].includes(sk[i]) ? sk[i] : 'individual';
    stmts.push(stmt(db, 'INSERT INTO shareholders (id, company_id, name, kind, email) VALUES (?,?,?,?,?)', shId, co.id, name, kind, se[i]));
    const qty = Math.floor(Number(sq[i]) || 0);
    if (qty > 0) {
      stmts.push(stmt(db, "INSERT INTO share_transactions (id, company_id, share_class_id, kind, to_shareholder_id, quantity, price_per_share, tx_date, certificate_number) VALUES (?,?,?,'issuance',?,?,?,?,?)",
        newId(), co.id, classIds[0], shId, qty, Math.max(0, Number(sp[i]) || 0), issueDate, `A-${cert++}`));
    }
  });

  // Checklist
  STANDARD_TASKS[mode].forEach((title, i) => {
    if (mode === 'incorporate' && nameType === 'numbered' && /name search/i.test(title)) return;
    stmts.push(stmt(db, 'INSERT INTO tasks (id, company_id, title, sort, created_by) VALUES (?,?,?,?,?)', newId(), co.id, title, i, user.id));
  });
  if (mode === 'import') stmts.push(...complianceStatements(db, { id: co.id, jurisdiction: j.code, incorporation_date: incDate, fiscal_year_end: fye, status }, today()));
  stmts.push(logStmt(db, user.id, `${mode === 'import' ? 'Imported' : 'Opened incorporation file for'} ${legalName ?? 'numbered company'}`, { companyId: co.id, clientId }));

  await batch(db, stmts);
  return redirect(c, `/companies/${co.id}`, 'ok', mode === 'import' ? 'Company imported.' : 'Incorporation file created. Work through the checklist under Tasks.');
});

// ---------------------------------------------------------------- show
const TABS: [string, string][] = [
  ['overview', 'Overview'], ['people', 'Directors & officers'], ['shares', 'Shares'], ['financing', 'Financing'], ['resolutions', 'Resolutions'],
  ['files', 'Documents'], ['documents', 'Minute book'], ['team', 'Employees'], ['compliance', 'Compliance'], ['tasks', 'Tasks'], ['activity', 'Activity'],
];

app.get('/:id', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  if (!b) return c.notFound();
  const tab = TABS.some(([k]) => k === c.req.query('tab')) ? c.req.query('tab')! : 'overview';
  const users = tab === 'tasks' ? await all<User>(c.env.DB, 'SELECT id, name FROM users WHERE active = 1 ORDER BY name') : [];
  const { company: co } = b;
  const openTasks = b.tasks.filter((t) => !t.done_at).length;
  const t = today();
  const overdue = b.compliance.filter((x) => !x.completed_on && x.due_date < t).length;

  return Page(c, {
    title: b.name,
    crumbs: [['Companies', '/companies'], [b.client?.name ?? 'No client', b.client ? `/clients/${b.client.id}` : undefined]],
    sub: (
      <div class="row small muted">
        <StatusBadge status={co.status} />
        <span>{b.j.longName}</span>
        {co.corp_number ? <span class="mono">Corp. #{co.corp_number}</span> : null}
        {co.incorporation_date ? <span>Incorporated <D d={co.incorporation_date} /></span> : null}
      </div>
    ),
    actions: <a class="btn" href={`/companies/${co.id}/edit`}>Edit details</a>,
    children: (
      <>
        <nav class="tabs">
          {TABS.map(([k, l]) => (
            <a href={`/companies/${co.id}?tab=${k}`} class={k === tab ? 'on' : ''}>
              {l}
              {k === 'tasks' && openTasks ? <span class="badge" style="margin-left:6px">{openTasks}</span> : null}
              {k === 'compliance' && overdue ? <span class="badge b-bad" style="margin-left:6px">{overdue}</span> : null}
            </a>
          ))}
        </nav>
        {tab === 'overview' ? <Overview b={b} /> : null}
        {tab === 'people' ? <People b={b} /> : null}
        {tab === 'shares' ? <Shares b={b} /> : null}
        {tab === 'resolutions' ? <Resolutions b={b} /> : null}
        {tab === 'compliance' ? <Compliance b={b} today={t} /> : null}
        {tab === 'tasks' ? <Tasks b={b} users={users} /> : null}
        {tab === 'documents' ? <Documents b={b} /> : null}
        {tab === 'files' ? <FilesTab b={b} q={c.req.query('q') ?? ''} cat={c.req.query('cat') ?? ''} /> : null}
        {tab === 'team' ? <TeamTab b={b} /> : null}
        {tab === 'financing' ? <FinancingTab b={b} /> : null}
        {tab === 'activity' ? <ActivityTab b={b} /> : null}
      </>
    ),
  });
});

const Overview = ({ b }: { b: CompanyBundle }) => {
  const co = b.company;
  const idx = statusIndex(co.status);
  const residents = b.currentDirectors.filter((d) => d.resident_canadian).length;
  const pct = b.currentDirectors.length ? (residents / b.currentDirectors.length) * 100 : 0;
  const warnings: string[] = [];
  if (b.j.residentDirectorPct && b.currentDirectors.length && pct < b.j.residentDirectorPct) warnings.push(`Only ${pct.toFixed(0)}% of directors are resident Canadians; ${b.j.longName} expects at least ${b.j.residentDirectorPct}% (verify current rules).`);
  if (b.currentDirectors.length < co.min_directors) warnings.push(`Fewer directors (${b.currentDirectors.length}) than the minimum in the articles (${co.min_directors}).`);
  if (b.currentDirectors.length > co.max_directors) warnings.push(`More directors (${b.currentDirectors.length}) than the maximum in the articles (${co.max_directors}).`);
  if (!b.classes.length) warnings.push('No share classes are set up.');
  if (co.status === 'active' && !b.txs.length) warnings.push('No shares have been issued. A corporation should have at least one shareholder.');
  const cap = capTable(b.shareholders, b.classes, b.txs);

  return (
    <div class="grid g2">
      <div>
        <div class="card">
          <div class="row spread"><h2>Incorporation progress</h2><span class="small muted">{statusLabel(co.status)}</span></div>
          {co.status !== 'dissolved' ? <div class="pipeline">{STATUSES.slice(0, 5).map((_, i) => <span class={i <= idx ? 'on' : ''} />)}</div> : null}
          <div class="small muted row spread" style="margin-bottom:10px">{STATUSES.slice(0, 5).map((st) => <span>{st.label}</span>)}</div>
          <StatusForm b={b} />
        </div>
        {warnings.length ? <div class="card">{warnings.map((w) => <div class="alert warn">{w}</div>)}</div> : null}
        <div class="card">
          <h2>Corporate profile</h2>
          <dl class="kv">
            <dt>Legal name</dt><dd>{b.name}</dd>
            <dt>Governing statute</dt><dd>{b.j.statute}</dd>
            <dt>Corporation #</dt><dd>{co.corp_number || '—'}</dd>
            <dt>Business # (BN)</dt><dd>{co.business_number || '—'}</dd>
            <dt>GST/HST #</dt><dd>{co.gst_number || '—'}</dd>
            <dt>Payroll program #</dt><dd>{co.payroll_number || <a href={`/companies/${co.id}/edit`}>Add payroll account</a>}</dd>
            <dt>Import-export #</dt><dd>{co.import_export_number || <a href={`/companies/${co.id}/edit`}>Add import-export number</a>}</dd>
            <dt>Incorporated</dt><dd><D d={co.incorporation_date} /></dd>
            <dt>Annual return due</dt><dd>{b.compliance.find((x) => x.kind === 'annual_return' && !x.completed_on) ? <D d={b.compliance.find((x) => x.kind === 'annual_return' && !x.completed_on)!.due_date} /> : '—'}</dd>
            <dt>Fiscal year end</dt><dd>{fyeLabel(co.fiscal_year_end) || '—'}</dd>
            <dt>Registered office</dt><dd>{co.registered_office || '—'}</dd>
            {co.records_office ? <><dt>Records office</dt><dd>{co.records_office}</dd></> : null}
            {co.mailing_address ? <><dt>Mailing address</dt><dd>{co.mailing_address}</dd></> : null}
            <dt>Business activity</dt><dd>{co.business_activity || '—'}</dd>
            <dt>Directors (min–max)</dt><dd>{co.min_directors}–{co.max_directors}</dd>
            <dt>Share evidence</dt><dd>{co.uncertificated ? 'Uncertificated (notices issued)' : 'Share certificates'}</dd>
            {co.nuans_number ? <><dt>Name search / NR #</dt><dd>{co.nuans_number}{co.nuans_date ? <> (<D d={co.nuans_date} />)</> : null}{co.name_request_expires ? <div class="small muted">Reservation expires <D d={co.name_request_expires} /></div> : null}</dd></> : null}
            {co.registry_password ? <><dt>Registry password</dt><dd><details class="inline"><summary class="small">Show</summary><span class="mono">{co.registry_password}</span></details></dd></> : null}
            {co.restrictions ? <><dt>Restrictions</dt><dd>{co.restrictions}</dd></> : null}
            {co.extra_info ? <><dt>Extra information</dt><dd>{co.extra_info}</dd></> : null}
            {co.notes ? <><dt>Notes</dt><dd>{co.notes}</dd></> : null}
          </dl>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="row spread"><h2>Directors</h2><a class="small" href={`/companies/${co.id}?tab=people`}>Manage</a></div>
          {b.currentDirectors.length ? <ul class="list-plain">{b.currentDirectors.map((d) => <li>{d.name} {d.resident_canadian ? <span class="badge">Resident Canadian</span> : null}<div class="small muted">{b.currentOfficers.filter((o) => o.name === d.name).map((o) => o.title).join(', ')}</div></li>)}</ul> : <Empty>No directors.</Empty>}
        </div>
        <div class="card">
          <div class="row spread"><h2>Ownership</h2><a class="small" href={`/companies/${co.id}?tab=shares`}>Cap table</a></div>
          {cap.total ? (
            <table>
              <tbody>
                {cap.rows.filter((r) => r.total).map((r) => (
                  <tr><td>{r.shareholder.name}</td><td class="num">{r.total.toLocaleString()}</td><td style="width:35%"><div class="bar"><i style={`width:${r.pctEquity.toFixed(1)}%`} /></div></td><td class="num">{r.pctEquity.toFixed(1)}%</td></tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No shares issued yet.</Empty>}
        </div>
        <div class="card">
          <div class="row spread"><h2>Next deadlines</h2><a class="small" href={`/companies/${co.id}?tab=compliance`}>All</a></div>
          {b.compliance.filter((x) => !x.completed_on).slice(0, 4).map((x) => <div class="row spread" style="padding:6px 0"><span>{x.title}</span><span><D d={x.due_date} /></span></div>)}
          {!b.compliance.some((x) => !x.completed_on) ? <p class="muted small">{co.incorporation_date ? 'Nothing outstanding.' : 'The compliance calendar is generated once the company is incorporated.'}</p> : null}
        </div>
        <div class="card">
          <h2>Client</h2>
          {b.client ? <><a href={`/clients/${b.client.id}`}><strong>{b.client.name}</strong></a><div class="small muted">{b.client.email} {b.client.phone}</div></> : <span class="muted">No client linked.</span>}
        </div>
      </div>
    </div>
  );
};

const StatusForm = ({ b }: { b: CompanyBundle }) => {
  const co = b.company;
  return (
    <form method="post" action={`/companies/${co.id}/status`} class="stack">
      <div class="fields">
        <Select label="Status" name="status" value={co.status} options={STATUSES.map((st) => [st.code, st.label])} />
        <Field label="Incorporation date" name="incorporation_date" type="date" value={co.incorporation_date} hint="required for Active" />
        <Field label="Corporation #" name="corp_number" value={co.corp_number} hint={co.name_type === 'numbered' ? 'sets the name' : undefined} />
      </div>
      <button class="btn primary sm">Update status</button>
    </form>
  );
};

const People = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  return (
    <>
    <div class="grid g2">
      <div class="card flush">
        <h2>Directors register</h2>
        <table>
          <thead><tr><th>Name</th><th>Appointed</th><th>Ceased</th><th></th></tr></thead>
          <tbody>
            {b.directors.map((d) => (
              <tr class={d.ceased_on ? 'done' : ''}>
                <td><span class="t">{d.name}</span><div class="small muted">{[d.email, d.address].filter(Boolean).join(' · ')}</div>{d.resident_canadian ? <span class="badge">Resident Canadian</span> : null}</td>
                <td><D d={d.appointed_on} /></td>
                <td><D d={d.ceased_on} /></td>
                <td class="num">{!d.ceased_on ? (
                  <details class="inline"><summary class="small">Cease</summary>
                    <Post action={`/companies/${id}/directors/${d.id}/cease`} inline={false}><input type="date" name="date" required /><button class="btn sm" style="margin-top:6px">Record</button></Post>
                  </details>) : <Post action={`/companies/${id}/directors/${d.id}/delete`} confirm="Delete this director record entirely?"><button class="btn sm link">Delete</button></Post>}</td>
              </tr>
            ))}
            {!b.directors.length ? <tr><td colspan={4}><Empty>No directors recorded.</Empty></td></tr> : null}
          </tbody>
        </table>
        <div style="padding:16px 20px;border-top:1px solid var(--line)">
          <details class="inline"><summary>+ Add director</summary>
            <form method="post" action={`/companies/${id}/directors`} class="stack">
              <div class="fields">
                <Field label="Full name" name="name" required />
                <Field label="Email" name="email" type="email" />
                <Field label="Address" name="address" />
                <Field label="Appointed on" name="appointed_on" type="date" />
                <Select label="Resident Canadian" name="resident_canadian" value="1" options={[['1', 'Yes'], ['0', 'No']]} />
              </div>
              <button class="btn primary sm">Add director</button>
            </form>
          </details>
        </div>
      </div>
      <div class="card flush">
        <h2>Officers register</h2>
        <table>
          <thead><tr><th>Name</th><th>Office</th><th>Appointed</th><th></th></tr></thead>
          <tbody>
            {b.officers.map((o) => (
              <tr class={o.ceased_on ? 'done' : ''}>
                <td><span class="t">{o.name}</span>{o.ceased_on ? <div class="small muted">Ceased <D d={o.ceased_on} /></div> : null}</td>
                <td>{o.title}</td>
                <td><D d={o.appointed_on} /></td>
                <td class="num">{!o.ceased_on ? (
                  <details class="inline"><summary class="small">Cease</summary>
                    <Post action={`/companies/${id}/officers/${o.id}/cease`} inline={false}><input type="date" name="date" required /><button class="btn sm" style="margin-top:6px">Record</button></Post>
                  </details>) : null}</td>
              </tr>
            ))}
            {!b.officers.length ? <tr><td colspan={4}><Empty>No officers recorded.</Empty></td></tr> : null}
          </tbody>
        </table>
        <div style="padding:16px 20px;border-top:1px solid var(--line)">
          <details class="inline"><summary>+ Appoint officer</summary>
            <form method="post" action={`/companies/${id}/officers`} class="stack">
              <div class="fields">
                <div><label>Name</label><input name="name" list="people" required /></div>
                <Select label="Office" name="title" value="President" options={['President', 'Secretary', 'Treasurer', 'Chief Executive Officer', 'Chief Financial Officer', 'Vice-President', 'Chair'].map((x) => [x, x])} />
                <Field label="Appointed on" name="appointed_on" type="date" />
              </div>
              <datalist id="people">{b.currentDirectors.map((d) => <option value={d.name} />)}</datalist>
              <button class="btn primary sm">Appoint</button>
            </form>
          </details>
        </div>
      </div>
    </div>
    <IscSection b={b} />
    </>
  );
};

const Shares = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  const cap = capTable(b.shareholders, b.classes, b.txs);
  const shName = new Map(b.shareholders.map((x) => [x.id, x.name]));
  const clName = new Map(b.classes.map((x) => [x.id, x.name]));
  const opts = b.shareholders.map((x) => [x.id, x.name] as [string, string]);
  return (
    <>
      <div class="card flush">
        <div class="row spread" style="padding:16px 20px 0"><h2>Capitalization table</h2><span class="row"><a class="btn sm" href={`/companies/${id}/cap-table.csv`}>Export cap table</a><a class="btn sm" href={`/companies/${id}/documents/securities-register`} target="_blank">Securities register</a></span></div>
        {b.shareholders.length ? (
          <table>
            <thead><tr><th>Shareholder</th>{b.classes.map((cl) => <th class="num">{cl.name}</th>)}<th class="num">Total</th><th class="num">Equity %</th><th class="num">Voting %</th></tr></thead>
            <tbody>
              {cap.rows.map((r) => (
                <tr><td>{r.shareholder.name}<div class="small muted">{r.shareholder.kind}</div></td>{b.classes.map((cl) => <td class="num">{(r.byClass[cl.id] || 0).toLocaleString()}</td>)}<td class="num"><strong>{r.total.toLocaleString()}</strong></td><td class="num">{r.pctEquity.toFixed(2)}%</td><td class="num">{r.pctVoting.toFixed(2)}%</td></tr>
              ))}
              <tr><td><strong>Outstanding</strong></td>{b.classes.map((cl) => <td class="num"><strong>{cap.classTotals[cl.id].toLocaleString()}</strong></td>)}<td class="num"><strong>{cap.total.toLocaleString()}</strong></td><td class="num">100%</td><td class="num">{cap.votingTotal ? '100%' : '—'}</td></tr>
            </tbody>
          </table>
        ) : <Empty>No shareholders yet.</Empty>}
      </div>

      <div class="grid g2">
        <div class="card">
          <h2>Record a share transaction</h2>
          {b.classes.length && b.shareholders.length ? (
            <form method="post" action={`/companies/${id}/transactions`} class="stack">
              <div class="fields">
                <Select label="Type" name="kind" value="issuance" options={[['issuance', 'Issuance (treasury)'], ['transfer', 'Transfer'], ['redemption', 'Redemption / repurchase']]} />
                <Select label="Share class" name="share_class_id" options={b.classes.map((cl) => [cl.id, cl.name])} />
                <div data-show-when="kind=transfer|redemption"><Select label="From" name="from_shareholder_id" blank="—" options={opts} /></div>
                <div data-show-when="kind=issuance|transfer"><Select label="To" name="to_shareholder_id" blank="—" options={opts} /></div>
                <Field label="Number of shares" name="quantity" type="number" required attrs={{ min: '1', step: '1' }} />
                <Field label="Price per share ($)" name="price_per_share" type="number" value="1.00" attrs={{ min: '0', step: '0.0001' }} />
                <Field label="Date" name="tx_date" type="date" value={today()} required />
                <Field label="Certificate #" name="certificate_number" />
              </div>
              <Field label="Notes" name="notes" />
              <button class="btn primary sm">Record transaction</button>
            </form>
          ) : <p class="muted">Add a share class and a shareholder first.</p>}
        </div>
        <div>
          <div class="card">
            <h2>Shareholders</h2>
            <ul class="list-plain">{b.shareholders.map((x) => <li class="row spread"><span>{x.name}<span class="small muted"> · {x.kind}{x.email ? ` · ${x.email}` : ''}</span></span>{!b.txs.some((t) => t.from_shareholder_id === x.id || t.to_shareholder_id === x.id) ? <Post action={`/companies/${id}/shareholders/${x.id}/delete`}><button class="btn sm link">Remove</button></Post> : null}</li>)}</ul>
            <details class="inline" style="margin-top:10px"><summary>+ Add shareholder</summary>
              <form method="post" action={`/companies/${id}/shareholders`} class="stack">
                <div class="fields">
                  <Field label="Name" name="name" required />
                  <Select label="Type" name="kind" value="individual" options={[['individual', 'Individual'], ['corporation', 'Corporation'], ['trust', 'Trust']]} />
                  <Field label="Email" name="email" type="email" />
                  <Field label="Address" name="address" />
                </div>
                <button class="btn primary sm">Add shareholder</button>
              </form>
            </details>
          </div>
          <div class="card">
            <h2>Authorized share classes</h2>
            <ul class="list-plain">{b.classes.map((cl) => <li><strong>{cl.name}</strong> <span class={`badge ${cl.voting ? 'b-brand' : ''}`}>{cl.voting ? 'Voting' : 'Non-voting'}</span> {cl.participating ? <span class="badge">Participating</span> : null} <span class="small muted">{cl.max_shares ? `max ${cl.max_shares.toLocaleString()}` : 'unlimited'}</span><div class="small muted">{cl.rights}</div></li>)}</ul>
            <details class="inline" style="margin-top:10px"><summary>+ Add share class</summary>
              <form method="post" action={`/companies/${id}/share-classes`} class="stack">
                <div class="fields">
                  <Field label="Class name" name="name" required placeholder="e.g. Class D Preferred" />
                  <Select label="Voting" name="voting" value="0" options={[['1', 'Voting'], ['0', 'Non-voting']]} />
                  <Select label="Participating" name="participating" value="0" options={[['1', 'Yes'], ['0', 'No']]} />
                  <Field label="Maximum shares" name="max_shares" type="number" hint="blank = unlimited" />
                </div>
                <Area label="Rights, privileges, restrictions" name="rights" />
                <p class="small muted">Adding a class after incorporation normally requires articles of amendment.</p>
                <button class="btn primary sm">Add class</button>
              </form>
            </details>
          </div>
        </div>
      </div>

      <div class="card flush">
        <h2>Share ledger</h2>
        {b.txs.length ? (
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Class</th><th>From</th><th>To</th><th class="num">Shares</th><th class="num">Consideration</th><th>Cert.</th><th></th></tr></thead>
            <tbody>
              {b.txs.map((t) => (
                <tr>
                  <td><D d={t.tx_date} /></td>
                  <td><span class="badge">{t.kind}</span></td>
                  <td>{clName.get(t.share_class_id)}</td>
                  <td>{t.from_shareholder_id ? shName.get(t.from_shareholder_id) : <span class="muted">Treasury</span>}</td>
                  <td>{t.to_shareholder_id ? shName.get(t.to_shareholder_id) : <span class="muted">Cancelled</span>}</td>
                  <td class="num">{t.quantity.toLocaleString()}</td>
                  <td class="num">${(t.quantity * t.price_per_share).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td>{t.certificate_number ? (t.to_shareholder_id ? <a href={`/companies/${id}/documents/certificate/${t.id}`} target="_blank">{t.certificate_number}</a> : t.certificate_number) : '—'}</td>
                  <td class="num"><Post action={`/companies/${id}/transactions/${t.id}/delete`} confirm="Delete this ledger entry? Later entries that depend on it may become invalid."><button class="btn sm link">Delete</button></Post></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No transactions recorded.</Empty>}
      </div>
    </>
  );
};

const Resolutions = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  return (
    <div class="grid g2">
      <div class="card flush">
        <h2>Resolutions</h2>
        {b.resolutions.length ? (
          <table>
            <tbody>
              {b.resolutions.map((r) => (
                <tr>
                  <td><a href={`/companies/${id}/resolutions/${r.id}`}>{r.title}</a><div class="small muted">{r.body_type === 'directors' ? 'Directors' : 'Shareholders'} · <D d={r.resolution_date} /></div></td>
                  <td class="num">{r.signed_on ? <span class="badge b-ok">Signed</span> : <span class="badge b-warn">Awaiting signature</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>No resolutions yet.</Empty>}
      </div>
      <div class="card">
        <h2>Draft a resolution</h2>
        <p class="muted small">Templates pre-fill from the company's records. You can edit the wording before saving.</p>
        <ul class="list-plain">
          {TEMPLATES.map((t) => (
            <li class="row spread">
              <span><strong>{t.label}</strong><div class="small muted">{t.description}</div></span>
              <a class="btn sm" href={`/companies/${id}/resolutions/new?kind=${t.kind}`}>Draft</a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const Compliance = ({ b, today: t }: { b: CompanyBundle; today: string }) => {
  const id = b.company.id;
  return (
    <div class="card flush">
      <div class="row spread" style="padding:16px 20px 0">
        <h2>Compliance calendar</h2>
        <Post action={`/companies/${id}/compliance/generate`}><button class="btn sm" disabled={!b.company.incorporation_date}>Refresh schedule</button></Post>
      </div>
      {b.compliance.length ? (
        <table>
          <thead><tr><th>Obligation</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {b.compliance.map((x) => (
              <tr class={x.completed_on ? 'done' : ''}>
                <td><span class="t">{x.title}</span>{x.notes ? <div class="small muted">{x.notes}</div> : null}</td>
                <td><D d={x.due_date} /></td>
                <td><DueBadge item={x} today={t} />{x.completed_on ? <div class="small muted">on <D d={x.completed_on} /></div> : null}</td>
                <td class="num">
                  {x.completed_on
                    ? <Post action={`/compliance/${x.id}/reopen`}><input type="hidden" name="back" value={`/companies/${id}?tab=compliance`} /><button class="btn sm link">Reopen</button></Post>
                    : <Post action={`/compliance/${x.id}/complete`}><input type="hidden" name="back" value={`/companies/${id}?tab=compliance`} /><button class="btn sm">Mark filed</button></Post>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>{b.company.incorporation_date ? 'No obligations scheduled.' : 'Set an incorporation date (mark the company Active) to generate annual returns, tax and annual resolution deadlines.'}</Empty>}
      <div style="padding:16px 20px;border-top:1px solid var(--line)">
        <details class="inline"><summary>+ Add a one-off deadline</summary>
          <form method="post" action={`/companies/${id}/compliance`} class="stack">
            <div class="fields"><Field label="Title" name="title" required /><Field label="Due date" name="due_date" type="date" required /></div>
            <Field label="Notes" name="notes" />
            <button class="btn primary sm">Add</button>
          </form>
        </details>
      </div>
    </div>
  );
};

const Tasks = ({ b, users }: { b: CompanyBundle; users: User[] }) => {
  const id = b.company.id;
  const back = `/companies/${id}?tab=tasks`;
  return (
    <div class="card flush">
      <h2>Checklist</h2>
      {b.tasks.length ? (
        <table>
          <tbody>
            {b.tasks.map((t) => (
              <tr class={t.done_at ? 'done' : ''}>
                <td style="width:40px"><Post action={`/tasks/${t.id}/toggle`}><input type="hidden" name="back" value={back} /><button class="btn sm" title={t.done_at ? 'Mark not done' : 'Mark done'}>{t.done_at ? '✓' : '○'}</button></Post></td>
                <td><span class="t">{t.title}</span><div class="small muted">{t.assignee_name ?? 'Unassigned'}{t.due_date ? <> · due <D d={t.due_date} /></> : null}</div></td>
                <td class="num"><Post action={`/tasks/${t.id}/delete`}><input type="hidden" name="back" value={back} /><button class="btn sm link">Delete</button></Post></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <Empty>No tasks.</Empty>}
      <form method="post" action="/tasks" style="padding:16px 20px;border-top:1px solid var(--line)" class="row">
        <input type="hidden" name="company_id" value={id} />
        <input type="hidden" name="back" value={back} />
        <input name="title" placeholder="Add a task…" required style="flex:2;min-width:200px" />
        <input name="due_date" type="date" style="flex:1;min-width:140px" />
        <select name="assignee_id" style="flex:1;min-width:140px"><option value="">Unassigned</option>{users.map((u) => <option value={u.id}>{u.name}</option>)}</select>
        <button class="btn primary">Add</button>
      </form>
    </div>
  );
};

const Documents = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  const docs: [string, string, string][] = [
    ['minute-book', 'Complete minute book', 'Cover, index, all registers and signed resolutions in one printable document.'],
    ['directors-register', 'Register of directors', 'Current and former directors with appointment dates.'],
    ['officers-register', 'Register of officers', 'Current and former officers.'],
    ['securities-register', 'Securities register & ledger', 'All issuances, transfers and redemptions by class.'],
    ['shareholders-register', 'Register of shareholders', 'Current holdings by shareholder.'],
    ['isc-register', 'Individuals with significant control', 'Shareholders holding 25%+ of votes or value (verify indirect control manually).'],
  ];
  return (
    <div class="grid g2">
      <div class="card">
        <h2>Registers & minute book</h2>
        <p class="muted small">Documents open in a print-ready view. Use your browser's "Save as PDF" to file them.</p>
        <ul class="list-plain">{docs.map(([k, l, d]) => <li class="row spread"><span><strong>{l}</strong><div class="small muted">{d}</div></span><a class="btn sm" target="_blank" href={`/companies/${id}/documents/${k}`}>Open</a></li>)}</ul>
      </div>
      <div>
        <div class="card">
          <h2>{b.company.uncertificated ? 'Notices of uncertificated shares' : 'Share certificates'}</h2>
          {b.company.uncertificated ? <p class="small muted">This company's shares are uncertificated. A written notice with the information a certificate would contain is sent to the holder after each issue or transfer.</p> : null}
          {b.txs.filter((t) => t.to_shareholder_id && t.certificate_number).length ? (
            <ul class="list-plain">{b.txs.filter((t) => t.to_shareholder_id && t.certificate_number).map((t) => (
              <li class="row spread"><span>{b.company.uncertificated ? 'Notice' : 'Certificate'} {t.certificate_number}<div class="small muted">{t.quantity.toLocaleString()} {b.classes.find((cl) => cl.id === t.share_class_id)?.name} · {b.shareholders.find((x) => x.id === t.to_shareholder_id)?.name}</div></span><a class="btn sm" target="_blank" href={`/companies/${id}/documents/${b.company.uncertificated ? 'notice' : 'certificate'}/${t.id}`}>Open</a></li>
            ))}</ul>
          ) : <Empty>{b.company.uncertificated ? 'Notices' : 'Certificates'} appear here for ledger entries with a number.</Empty>}
        </div>
        <div class="card">
          <div class="row spread"><h2>Minute book documents</h2><a class="small" href={`/companies/${id}?tab=files`}>All documents</a></div>
          {b.docs.filter((d) => d.in_minute_book).length ? (
            <ul class="list-plain">{b.docs.filter((d) => d.in_minute_book).map((d) => (
              <li class="row spread"><span>{d.title}<div class="small muted"><D d={d.doc_date ?? d.created_at.slice(0, 10)} /></div></span><a class="btn sm" target="_blank" href={`/companies/${id}/files/${d.id}`}>Open</a></li>
            ))}</ul>
          ) : <Empty>Mark uploaded or generated documents as "in minute book" to list them here.</Empty>}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- status
app.post('/:id/status', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const co = await first<Company>(db, 'SELECT * FROM companies WHERE id = ?', id);
  if (!co) return c.notFound();
  const f = await readForm(c);
  const status = s(f.status);
  if (!STATUS_CODES.includes(status)) return redirect(c, `/companies/${id}`, 'error', 'Unknown status.');
  const incDate = s(f.incorporation_date) || null;
  if (incDate && !isIso(incDate)) return redirect(c, `/companies/${id}`, 'error', 'Incorporation date is not valid.');
  if (status === 'active' && !incDate) return redirect(c, `/companies/${id}`, 'error', 'Enter the incorporation date before marking the company Active.');
  const corpNumber = s(f.corp_number) || null;
  const next = { ...co, status, incorporation_date: incDate, corp_number: corpNumber };
  const legalName = co.name_type === 'numbered' || !co.legal_name ? computeLegalName(next) ?? co.legal_name : co.legal_name;
  const stmts = [
    stmt(db, "UPDATE companies SET status = ?, incorporation_date = ?, corp_number = ?, legal_name = ?, updated_at = datetime('now') WHERE id = ?", status, incDate, corpNumber, legalName, id),
    // Backfill appointment/issue dates captured before incorporation.
    ...(incDate ? [
      stmt(db, 'UPDATE directors SET appointed_on = ? WHERE company_id = ? AND appointed_on IS NULL', incDate, id),
      stmt(db, 'UPDATE officers SET appointed_on = ? WHERE company_id = ? AND appointed_on IS NULL', incDate, id),
    ] : []),
    // First time the incorporation date is set: initial subscriptions recorded during the draft take effect on incorporation.
    ...(incDate && !co.incorporation_date ? [stmt(db, "UPDATE share_transactions SET tx_date = ? WHERE company_id = ? AND kind = 'issuance'", incDate, id)] : []),
    ...complianceStatements(db, next, today()),
  ];
  if (status !== co.status) stmts.push(logStmt(db, c.get('user').id, `${legalName ?? displayName(co)}: status ${statusLabel(co.status)} → ${statusLabel(status)}`, { companyId: id, clientId: co.client_id }));
  await batch(db, stmts);
  return redirect(c, `/companies/${id}`, 'ok', status === 'active' && co.status !== 'active' ? 'Company marked Active. Compliance calendar generated.' : 'Status updated.');
});

// ---------------------------------------------------------------- edit
app.get('/:id/edit', async (c) => {
  const co = await first<Company>(c.env.DB, 'SELECT * FROM companies WHERE id = ?', c.req.param('id'));
  if (!co) return c.notFound();
  const clients = await all<Client>(c.env.DB, 'SELECT id, name FROM clients ORDER BY name');
  const [fm, fd] = (co.fiscal_year_end ?? '12-31').split('-');
  const isAdmin = c.get('user').role === 'admin';
  return Page(c, {
    title: 'Edit company',
    crumbs: [['Companies', '/companies'], [displayName(co), `/companies/${co.id}`], ['Edit']],
    children: (
      <>
        <form method="post" action={`/companies/${co.id}/edit`} class="card stack" data-name-preview>
          <div class="fields">
            <Select label="Client" name="client_id" value={co.client_id} blank="— None —" options={clients.map((cl) => [cl.id, cl.name])} />
            <Select label="Jurisdiction" name="jurisdiction" value={co.jurisdiction} options={jurisdictionList().map((j) => [j.code, j.longName])} />
            <Select label="Name type" name="name_type" value={co.name_type} options={[['named', 'Named'], ['numbered', 'Numbered']]} />
          </div>
          <div class="fields">
            <Field label="Distinctive element" name="distinctive" value={co.distinctive} hint="or full legal name for imported companies" />
            <Field label="Descriptive element" name="descriptive" value={co.descriptive} />
            <Select label="Legal ending" name="legal_ending" value={co.legal_ending} blank="(none / included above)" options={ALL_ENDINGS.map((e) => [e, e])} />
          </div>
          <div id="name-check"></div>
          <div class="fields">
            <Field label="Corporation #" name="corp_number" value={co.corp_number} />
            <Field label="Business # (BN)" name="business_number" value={co.business_number} />
            <Field label="GST/HST #" name="gst_number" value={co.gst_number} />
            <Field label="Payroll program #" name="payroll_number" value={co.payroll_number} />
            <Field label="Import-export #" name="import_export_number" value={co.import_export_number} />
            <Field label="NUANS / Name Request #" name="nuans_number" value={co.nuans_number} />
            <Field label="Name search date" name="nuans_date" type="date" value={co.nuans_date} />
            <Field label="Name reservation expires" name="name_request_expires" type="date" value={co.name_request_expires} />
            <div>
              <label for="registry_password">Registry company password <span class="hint">({co.registry_password ? 'saved; leave blank to keep' : 'optional'})</span></label>
              <input id="registry_password" name="registry_password" type="password" autocomplete="new-password" placeholder={co.registry_password ? '••••••••' : ''} />
              {co.registry_password ? <label class="check small" style="margin-top:4px"><input type="checkbox" name="clear_registry_password" value="1" /> Remove saved password</label> : null}
            </div>
            <div>
              <label>Fiscal year end</label>
              <div class="row"><select name="fye_month" style="width:60%">{MONTHS.map((m, i) => <option value={String(i + 1)} selected={i + 1 === Number(fm)}>{m}</option>)}</select><input name="fye_day" type="number" min="1" max="31" value={String(Number(fd))} style="width:35%" /></div>
            </div>
            <Field label="Min directors" name="min_directors" type="number" value={co.min_directors} />
            <Field label="Max directors" name="max_directors" type="number" value={co.max_directors} />
          </div>
          <div class="fields">
            <Area label="Registered office" name="registered_office" value={co.registered_office} />
            <Area label="Records office" name="records_office" value={co.records_office} hint="if different from registered office" />
            <Area label="Mailing address" name="mailing_address" value={co.mailing_address} />
          </div>
          <Field label="Business activity" name="business_activity" value={co.business_activity} />
          <label class="check"><input type="checkbox" name="uncertificated" value="1" checked={!!co.uncertificated} /> Shares are uncertificated (issue notices instead of share certificates)</label>
          <Area label="Restrictions" name="restrictions" value={co.restrictions} />
          <Area label="Extra information" name="extra_info" value={co.extra_info} hint="shown on the company profile" />
          <Area label="Internal notes" name="notes" value={co.notes} />
          <div class="row"><button class="btn primary">Save changes</button><a class="btn" href={`/companies/${co.id}`}>Cancel</a></div>
        </form>
        {isAdmin ? (
          <div class="card">
            <h2>Danger zone</h2>
            <Post action={`/companies/${co.id}/delete`} confirm="Permanently delete this company and all of its records? This cannot be undone."><button class="btn danger">Delete company file</button></Post>
          </div>
        ) : null}
      </>
    ),
  });
});

app.post('/:id/edit', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const co = await first<Company>(db, 'SELECT * FROM companies WHERE id = ?', id);
  if (!co) return c.notFound();
  const f = await readForm(c);
  const j = getJurisdiction(s(f.jurisdiction));
  if (!j) return redirect(c, `/companies/${id}/edit`, 'error', 'Choose a jurisdiction.');
  if ((s(f.nuans_date) && !isIso(s(f.nuans_date))) || (s(f.name_request_expires) && !isIso(s(f.name_request_expires)))) return redirect(c, `/companies/${id}/edit`, 'error', 'A name search date is not valid.');
  const registryPassword = s(f.clear_registry_password) ? null : s(f.registry_password) || co.registry_password || null;
  const next = {
    ...co,
    client_id: s(f.client_id) || null,
    jurisdiction: j.code,
    name_type: (s(f.name_type) === 'numbered' ? 'numbered' : 'named') as Company['name_type'],
    distinctive: s(f.distinctive),
    descriptive: s(f.descriptive),
    legal_ending: s(f.legal_ending),
    corp_number: s(f.corp_number),
    fiscal_year_end: fyeFrom(s(f.fye_month), s(f.fye_day)),
  };
  const legalName = computeLegalName(next);
  const stmts = [
    stmt(db, `UPDATE companies SET client_id=?, jurisdiction=?, name_type=?, distinctive=?, descriptive=?, legal_ending=?, legal_name=?, corp_number=?, business_number=?, nuans_number=?, nuans_date=?, fiscal_year_end=?, min_directors=?, max_directors=?, registered_office=?, mailing_address=?, business_activity=?, restrictions=?, notes=?, updated_at=datetime('now') WHERE id=?`,
      next.client_id, next.jurisdiction, next.name_type, next.distinctive, next.descriptive, next.legal_ending, legalName, next.corp_number, s(f.business_number), s(f.nuans_number), s(f.nuans_date), next.fiscal_year_end,
      int(f.min_directors) ?? 1, int(f.max_directors) ?? 10, s(f.registered_office), s(f.mailing_address), s(f.business_activity), s(f.restrictions), s(f.notes), id),
    stmt(db, 'UPDATE companies SET gst_number=?, payroll_number=?, import_export_number=?, records_office=?, registry_password=?, name_request_expires=?, extra_info=?, uncertificated=? WHERE id=?',
      s(f.gst_number), s(f.payroll_number), s(f.import_export_number), s(f.records_office), registryPassword, s(f.name_request_expires), s(f.extra_info), s(f.uncertificated) === '1', id),
    ...complianceStatements(db, next, today()),
    logStmt(db, c.get('user').id, `Updated details for ${legalName ?? displayName(next)}`, { companyId: id, clientId: next.client_id }),
  ];
  await batch(db, stmts);
  return redirect(c, `/companies/${id}`, 'ok', 'Company details saved.');
});

app.post('/:id/delete', async (c) => {
  if (c.get('user').role !== 'admin') return redirect(c, `/companies/${c.req.param('id')}`, 'error', 'Only administrators can delete companies.');
  const co = await first<Company>(c.env.DB, 'SELECT * FROM companies WHERE id = ?', c.req.param('id'));
  if (!co) return c.notFound();
  await batch(c.env.DB, [
    stmt(c.env.DB, 'DELETE FROM companies WHERE id = ?', co.id),
    logStmt(c.env.DB, c.get('user').id, `Deleted company file ${displayName(co)}`, { clientId: co.client_id }),
  ]);
  return redirect(c, '/companies', 'ok', 'Company deleted.');
});

// ---------------------------------------------------------------- one-off compliance + regenerate
app.post('/:id/compliance', async (c) => {
  const id = c.req.param('id');
  const f = await readForm(c);
  if (!s(f.title) || !isIso(s(f.due_date))) return redirect(c, `/companies/${id}?tab=compliance`, 'error', 'Title and a valid due date are required.');
  await run(c.env.DB, "INSERT OR IGNORE INTO compliance_items (id, company_id, kind, title, due_date, notes) VALUES (?,?,'custom',?,?,?)", newId(), id, s(f.title), s(f.due_date), s(f.notes));
  return redirect(c, `/companies/${id}?tab=compliance`, 'ok', 'Deadline added.');
});
app.post('/:id/compliance/generate', async (c) => {
  const co = await first<Company>(c.env.DB, 'SELECT * FROM companies WHERE id = ?', c.req.param('id'));
  if (!co) return c.notFound();
  await batch(c.env.DB, complianceStatements(c.env.DB, co, today()));
  return redirect(c, `/companies/${co.id}?tab=compliance`, 'ok', 'Compliance schedule refreshed.');
});

export default app;
