// Ownr-style sections: documents (R2 uploads + generated agreements), ISC individuals,
// employees & contractors, convertibles (notes / SAFEs), stock option plans, cap table export, activity.
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { batch, first, logStmt, newId, stmt } from '../lib/db.ts';
import { human, isIso, today } from '../lib/dates.ts';
import { capTable } from '../lib/captable.ts';
import { vestedQuantity } from '../lib/vesting.ts';
import { AGREEMENTS, DOC_CATEGORIES, categoryLabel, getAgreement } from '../lib/agreements.ts';
import { displayName, loadCompany, type CompanyBundle } from '../lib/company.ts';
import type { Company, Doc } from '../lib/types.ts';
import { readForm, redirect, s } from '../http.ts';
import { Area, D, Empty, Field, Page, Post, Select } from '../views/layout.tsx';
import { DocPage } from '../views/doc.tsx';

const app = new Hono<AppEnv>();
const MAX_UPLOAD = 25 * 1024 * 1024;
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n}%`);
const sizeLabel = (n: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const company = (db: D1Database, id: string) => first<Company>(db, 'SELECT * FROM companies WHERE id = ?', id);
const num = (v: unknown): number | null => (s(v) === '' || !Number.isFinite(Number(s(v))) ? null : Number(s(v)));

// ============================================================ Tab components (rendered by companies.tsx)

export const FilesTab = ({ b, q, cat }: { b: CompanyBundle; q: string; cat: string }) => {
  const id = b.company.id;
  const docs = b.docs.filter((d) => (!cat || d.category === cat) && (!q || `${d.title} ${d.file_name ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(AGREEMENTS.map((a) => a.group))];
  return (
    <div class="grid g2" style="grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      <div class="card flush">
        <div class="row spread" style="padding:16px 20px 0"><h2>Documents</h2><span class="small muted">{b.docs.length} total</span></div>
        <form method="get" class="filters" style="padding:10px 20px 0">
          <input type="hidden" name="tab" value="files" />
          <input name="q" value={q} placeholder="Search documents" />
          <select name="cat" data-autosubmit><option value="">All categories</option>{DOC_CATEGORIES.map(([k, l]) => <option value={k} selected={k === cat}>{l}</option>)}</select>
          <button class="btn sm">Search</button>
        </form>
        {docs.length ? (
          <table>
            <thead><tr><th>Document</th><th>Category</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr>
                  <td>
                    <a href={`/companies/${id}/files/${d.id}`} target={d.file_key ? '_blank' : undefined}><strong>{d.title}</strong></a>
                    <div class="small muted">{d.file_key ? `${d.file_name} · ${sizeLabel(d.size)}` : 'Generated document'}{d.in_minute_book ? ' · in minute book' : ''}</div>
                  </td>
                  <td class="small">{categoryLabel(d.category)}</td>
                  <td><D d={d.doc_date ?? d.created_at.slice(0, 10)} /></td>
                  <td class="num" style="white-space:nowrap">
                    {d.file_key ? <a class="btn sm" href={`/companies/${id}/files/${d.id}?download=1`}>Download</a> : null}{' '}
                    <details class="inline" style="display:inline-block;text-align:left"><summary class="small">More</summary>
                      <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">
                        <Post action={`/companies/${id}/files/${d.id}/minute-book`}><button class="btn sm">{d.in_minute_book ? 'Remove from minute book' : 'Add to minute book'}</button></Post>
                        <Post action={`/companies/${id}/files/${d.id}/delete`} confirm={`Delete "${d.title}"? This cannot be undone.`}><button class="btn sm danger">Delete</button></Post>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>{b.docs.length ? 'No documents match.' : 'No documents yet. Upload existing files or create one from a template.'}</Empty>}
      </div>
      <div>
        <div class="card">
          <h2>Upload a document</h2>
          <form method="post" action={`/companies/${id}/files`} enctype="multipart/form-data" class="stack">
            <div><label>File <span class="hint">(PDF, image, Word, Excel; max 25 MB)</span></label><input type="file" name="file" required /></div>
            <Field label="Title" name="title" hint="defaults to file name" />
            <div class="fields">
              <Select label="Category" name="category" value="other" options={DOC_CATEGORIES} />
              <Field label="Document date" name="doc_date" type="date" />
            </div>
            <label class="check"><input type="checkbox" name="in_minute_book" value="1" /> Part of the minute book</label>
            <button class="btn primary sm">Upload</button>
          </form>
        </div>
        <div class="card">
          <h2>Create a new document</h2>
          {groups.map((g) => (
            <div style="margin-bottom:10px">
              <h3 class="small muted" style="text-transform:uppercase;letter-spacing:.04em">{g}</h3>
              <ul class="list-plain">{AGREEMENTS.filter((a) => a.group === g).map((a) => <li class="row spread" style="padding:6px 0"><span>{a.label}<div class="small muted">{a.description}</div></span><a class="btn sm" href={`/companies/${id}/files/new?kind=${a.kind}`}>Create</a></li>)}</ul>
            </div>
          ))}
          <p class="small muted">Resolutions (including dividends) are under the Resolutions tab.</p>
        </div>
      </div>
    </div>
  );
};

export const IscSection = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  const cap = capTable(b.shareholders, b.classes, b.txs);
  const registered = cap.rows.filter((r) => r.pctVoting >= 25 || r.pctEquity >= 25);
  return (
    <div class="card flush">
      <h2>Individuals with significant control</h2>
      <p class="small muted" style="padding:0 20px">Holders of 25%+ of votes or shares appear automatically. Add anyone else with significant control or influence who isn't otherwise in the records (e.g. through a holding company, trust or agreement).</p>
      <table>
        <thead><tr><th>Individual</th><th>Nature of control</th><th>Since</th><th></th></tr></thead>
        <tbody>
          {registered.map((r) => <tr><td>{r.shareholder.name}<div class="small muted">Registered shareholder</div></td><td class="small">{r.pctVoting.toFixed(1)}% of votes, {r.pctEquity.toFixed(1)}% of shares</td><td>—</td><td></td></tr>)}
          {b.isc.map((x) => (
            <tr class={x.ceased_on ? 'done' : ''}>
              <td><span class="t">{x.name}</span><div class="small muted">{[x.address, x.birth_date ? `born ${x.birth_date}` : null, x.tax_residence ? `tax residence: ${x.tax_residence}` : null].filter(Boolean).join(' · ')}</div></td>
              <td class="small">{x.control_description}</td>
              <td><D d={x.became_on} />{x.ceased_on ? <div class="small muted">until <D d={x.ceased_on} /></div> : null}</td>
              <td class="num">{!x.ceased_on ? <details class="inline"><summary class="small">Cease</summary><Post action={`/companies/${id}/isc/${x.id}/cease`} inline={false}><input type="date" name="date" required /><button class="btn sm" style="margin-top:6px">Record</button></Post></details> : <Post action={`/companies/${id}/isc/${x.id}/delete`} confirm="Delete this record?"><button class="btn sm link">Delete</button></Post>}</td>
            </tr>
          ))}
          {!registered.length && !b.isc.length ? <tr><td colspan={4}><Empty>No individuals with significant control recorded.</Empty></td></tr> : null}
        </tbody>
      </table>
      <div style="padding:16px 20px;border-top:1px solid var(--line)">
        <details class="inline"><summary>+ Add individual</summary>
          <form method="post" action={`/companies/${id}/isc`} class="stack">
            <div class="fields">
              <Field label="Full name" name="name" required />
              <Field label="Address" name="address" />
              <Field label="Date of birth" name="birth_date" type="date" />
              <Field label="Jurisdiction of tax residence" name="tax_residence" />
              <Field label="Became an ISC on" name="became_on" type="date" />
            </div>
            <Area label="How they have significant control" name="control_description" />
            <button class="btn primary sm">Add individual</button>
          </form>
        </details>
      </div>
    </div>
  );
};

export const TeamTab = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  const section = (kind: 'employee' | 'contractor', title: string) => {
    const rows = b.workers.filter((w) => w.kind === kind);
    return (
      <div class="card flush">
        <h2>{title}</h2>
        {rows.length ? (
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Start</th><th>Compensation</th><th></th></tr></thead>
            <tbody>
              {rows.map((w) => (
                <tr class={w.end_date ? 'done' : ''}>
                  <td><span class="t">{w.name}</span><div class="small muted">{w.email}</div></td>
                  <td>{w.title}</td>
                  <td><D d={w.start_date} />{w.end_date ? <div class="small muted">ended <D d={w.end_date} /></div> : null}</td>
                  <td class="small">{w.compensation}</td>
                  <td class="num">{!w.end_date
                    ? <details class="inline"><summary class="small">End</summary><Post action={`/companies/${id}/workers/${w.id}/end`} inline={false}><input type="date" name="date" required /><button class="btn sm" style="margin-top:6px">Record</button></Post></details>
                    : <Post action={`/companies/${id}/workers/${w.id}/delete`} confirm="Delete this record?"><button class="btn sm link">Delete</button></Post>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>This company has no {title.toLowerCase()}.</Empty>}
        <div style="padding:16px 20px;border-top:1px solid var(--line)">
          <details class="inline"><summary>+ Add {kind}</summary>
            <form method="post" action={`/companies/${id}/workers`} class="stack">
              <input type="hidden" name="kind" value={kind} />
              <div class="fields">
                <Field label="Name" name="name" required />
                <Field label="Email" name="email" type="email" />
                <Field label={kind === 'employee' ? 'Job title' : 'Services'} name="title" />
                <Field label="Start date" name="start_date" type="date" />
                <Field label="Compensation" name="compensation" placeholder={kind === 'employee' ? '$65,000 / year' : '$85 / hour'} />
              </div>
              <Field label="Notes" name="notes" />
              <div class="row"><button class="btn primary sm">Add</button><span class="small muted">Then create the <a href={`/companies/${id}/files/new?kind=${kind === 'employee' ? 'employment' : 'contractor'}`}>{kind} agreement</a>.</span></div>
            </form>
          </details>
        </div>
      </div>
    );
  };
  return <div class="grid g2">{section('employee', 'Employees')}{section('contractor', 'Contractors')}</div>;
};

export const FinancingTab = ({ b }: { b: CompanyBundle }) => {
  const id = b.company.id;
  const t = today();
  const outstanding = b.convertibles.filter((x) => x.status === 'outstanding');
  const cap = capTable(b.shareholders, b.classes, b.txs);
  const activeGrants = b.grants.filter((g) => g.status === 'active');
  const granted = activeGrants.reduce((n, g) => n + g.quantity, 0);
  const pool = b.plans.reduce((n, p) => n + p.pool_size, 0);
  const fullyDiluted = cap.total + pool;
  return (
    <>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="card stat"><div class="n">{money(outstanding.reduce((n, x) => n + x.amount, 0))}</div><div class="l">Outstanding convertibles ({outstanding.length})</div></div>
        <div class="card stat"><div class="n">{cap.total.toLocaleString()}</div><div class="l">Shares outstanding</div></div>
        <div class="card stat"><div class="n">{pool.toLocaleString()}</div><div class="l">Option pool ({granted.toLocaleString()} granted)</div></div>
        <div class="card stat"><div class="n">{fullyDiluted.toLocaleString()}</div><div class="l">Fully diluted (shares + pool)</div></div>
      </div>
      <div class="card flush">
        <h2>Convertible notes & SAFEs</h2>
        {b.convertibles.length ? (
          <table>
            <thead><tr><th>Type</th><th>Investor</th><th>Issued</th><th class="num">Amount</th><th class="num">Interest</th><th class="num">Valuation cap</th><th class="num">Discount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {b.convertibles.map((x) => (
                <tr>
                  <td><span class="badge b-brand">{x.kind === 'safe' ? 'SAFE' : 'Note'}</span>{x.certificate_number ? <div class="small muted">#{x.certificate_number}</div> : null}</td>
                  <td>{x.investor}{x.notes ? <div class="small muted">{x.notes}</div> : null}</td>
                  <td><D d={x.issue_date} />{x.maturity_date ? <div class="small muted">matures <D d={x.maturity_date} /></div> : null}</td>
                  <td class="num">{money(x.amount)}</td>
                  <td class="num">{x.kind === 'note' ? pct(x.interest_rate) : '—'}</td>
                  <td class="num">{money(x.valuation_cap)}</td>
                  <td class="num">{pct(x.discount_rate)}</td>
                  <td>
                    <Post action={`/companies/${id}/convertibles/${x.id}/status`}>
                      <select name="status" data-autosubmit style="width:auto">{['outstanding', 'converted', 'repaid', 'cancelled'].map((st) => <option value={st} selected={st === x.status}>{st}</option>)}</select>
                    </Post>
                  </td>
                  <td class="num"><Post action={`/companies/${id}/convertibles/${x.id}/delete`} confirm="Delete this convertible?"><button class="btn sm link">Delete</button></Post></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>This company has no convertibles.</Empty>}
        <div style="padding:16px 20px;border-top:1px solid var(--line)">
          <details class="inline"><summary>+ Add convertible</summary>
            <form method="post" action={`/companies/${id}/convertibles`} class="stack">
              <div class="fields">
                <Select label="Type" name="kind" value="safe" options={[['safe', 'SAFE'], ['note', 'Convertible note']]} />
                <Field label="Investor" name="investor" required />
                <Field label="Issue date" name="issue_date" type="date" value={t} required />
                <Field label="Amount ($)" name="amount" type="number" required attrs={{ min: '0', step: '0.01' }} />
                <Field label="Valuation cap ($)" name="valuation_cap" type="number" attrs={{ min: '0', step: '1' }} />
                <Field label="Discount (%)" name="discount_rate" type="number" attrs={{ min: '0', max: '100', step: '0.1' }} />
                <div data-show-when="kind=note"><Field label="Interest (% / year)" name="interest_rate" type="number" attrs={{ min: '0', step: '0.1' }} /></div>
                <div data-show-when="kind=note"><Field label="Maturity date" name="maturity_date" type="date" /></div>
                <Field label="Certificate #" name="certificate_number" />
              </div>
              <Field label="Notes" name="notes" />
              <button class="btn primary sm">Add convertible</button>
            </form>
          </details>
        </div>
      </div>

      <div class="card flush">
        <h2>Employee stock option plan (ESOP)</h2>
        {b.plans.length ? (
          <>
            <table>
              <thead><tr><th>Plan</th><th>Class</th><th class="num">Pool</th><th class="num">Granted</th><th class="num">Available</th><th>Approved</th></tr></thead>
              <tbody>{b.plans.map((p) => {
                const g = activeGrants.filter((x) => x.plan_id === p.id).reduce((n, x) => n + x.quantity, 0);
                return <tr><td>{p.name}</td><td>{b.classes.find((c) => c.id === p.share_class_id)?.name ?? '—'}</td><td class="num">{p.pool_size.toLocaleString()}</td><td class="num">{g.toLocaleString()}</td><td class="num">{(p.pool_size - g).toLocaleString()}</td><td><D d={p.approved_on} /></td></tr>;
              })}</tbody>
            </table>
            <h3 style="padding:14px 20px 0">Option grants</h3>
            {b.grants.length ? (
              <table>
                <thead><tr><th>Holder</th><th class="num">Options</th><th class="num">Vested today</th><th class="num">Exercise price</th><th>Granted</th><th>Vesting</th><th>Status</th></tr></thead>
                <tbody>{b.grants.map((g) => (
                  <tr>
                    <td>{g.holder}{g.notes ? <div class="small muted">{g.notes}</div> : null}</td>
                    <td class="num">{g.quantity.toLocaleString()}</td>
                    <td class="num">{g.status === 'active' ? vestedQuantity(g, t).toLocaleString() : '—'}</td>
                    <td class="num">{money(g.exercise_price)}</td>
                    <td><D d={g.grant_date} /></td>
                    <td class="small">{g.vesting_months} mo, {g.cliff_months} mo cliff{g.vesting_start ? <> from <D d={g.vesting_start} /></> : null}</td>
                    <td><Post action={`/companies/${id}/option-grants/${g.id}/status`}><select name="status" data-autosubmit style="width:auto">{['active', 'exercised', 'cancelled', 'expired'].map((st) => <option value={st} selected={st === g.status}>{st}</option>)}</select></Post></td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <Empty>No options granted yet.</Empty>}
            <div style="padding:16px 20px;border-top:1px solid var(--line)">
              <details class="inline"><summary>+ Grant options</summary>
                <form method="post" action={`/companies/${id}/option-grants`} class="stack">
                  <div class="fields">
                    <Select label="Plan" name="plan_id" options={b.plans.map((p) => [p.id, p.name])} />
                    <Field label="Holder" name="holder" required />
                    <Field label="Number of options" name="quantity" type="number" required attrs={{ min: '1', step: '1' }} />
                    <Field label="Exercise price ($)" name="exercise_price" type="number" value="0.01" attrs={{ min: '0', step: '0.0001' }} />
                    <Field label="Grant date" name="grant_date" type="date" value={t} required />
                    <Field label="Vesting start" name="vesting_start" type="date" />
                    <Field label="Vesting period (months)" name="vesting_months" type="number" value="48" />
                    <Field label="Cliff (months)" name="cliff_months" type="number" value="12" />
                    <Field label="Expiry date" name="expiry_date" type="date" />
                  </div>
                  <button class="btn primary sm">Grant</button>
                </form>
              </details>
            </div>
          </>
        ) : <Empty>No option plan yet. Set one up to grant employees options with vesting.</Empty>}
        <div style="padding:16px 20px;border-top:1px solid var(--line)">
          <details class="inline" open={!b.plans.length}><summary>+ {b.plans.length ? 'Add another plan' : 'Set up an option plan'}</summary>
            <form method="post" action={`/companies/${id}/option-plans`} class="stack">
              <div class="fields">
                <Field label="Plan name" name="name" value="Stock Option Plan" required />
                <Select label="Share class" name="share_class_id" options={b.classes.map((c) => [c.id, c.name])} />
                <Field label="Pool size (options)" name="pool_size" type="number" required attrs={{ min: '1', step: '1' }} />
                <Field label="Board approval date" name="approved_on" type="date" />
              </div>
              <button class="btn primary sm">Create plan</button>
            </form>
          </details>
        </div>
      </div>
    </>
  );
};

export const ActivityTab = ({ b }: { b: CompanyBundle }) => (
  <div class="card flush">
    <h2>Activity</h2>
    {b.activity.length ? (
      <table>
        <thead><tr><th style="width:190px">Date</th><th>History</th><th>By</th></tr></thead>
        <tbody>{b.activity.map((a) => <tr><td class="small">{a.created_at.slice(0, 16).replace('T', ' ')}</td><td>{a.message}</td><td class="small muted">{a.user_name ?? 'Imported'}</td></tr>)}</tbody>
      </table>
    ) : <Empty>No activity yet.</Empty>}
  </div>
);

// ============================================================ Documents: upload, view/download, generate

app.post('/:id/files', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const back = `/companies/${co.id}?tab=files`;
  const f = await c.req.parseBody();
  const file = f.file;
  if (!(file instanceof File) || !file.size) return redirect(c, back, 'error', 'Choose a file to upload.');
  if (file.size > MAX_UPLOAD) return redirect(c, back, 'error', 'Files must be 25 MB or smaller.');
  const id = newId();
  const safeName = file.name.replace(/[^\w.\- ()]+/g, '_').slice(-120) || 'file';
  const key = `companies/${co.id}/${id}/${safeName}`;
  await c.env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
  const category = DOC_CATEGORIES.some(([k]) => k === s(f.category)) ? s(f.category) : 'other';
  const title = s(f.title) || safeName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ');
  await batch(db, [
    stmt(db, 'INSERT INTO documents (id, company_id, title, category, file_key, file_name, content_type, size, doc_date, in_minute_book, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, co.id, title, category, key, safeName, file.type || 'application/octet-stream', file.size, isIso(s(f.doc_date)) ? s(f.doc_date) : null, s(f.in_minute_book) === '1', c.get('user').id),
    logStmt(db, c.get('user').id, `${title} uploaded to documents`, { companyId: co.id }),
  ]);
  return redirect(c, back, 'ok', `Uploaded "${title}".`);
});

app.get('/:id/files/new', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  if (!b) return c.notFound();
  const def = getAgreement(c.req.query('kind') ?? '');
  if (!def) return redirect(c, `/companies/${b.company.id}?tab=files`, 'error', 'Unknown template.');
  const params: Record<string, string> = {};
  for (const p of def.params) params[p.name] = c.req.query(p.name) ?? p.default ?? '';
  const date = isIso(c.req.query('date')) ? c.req.query('date')! : today();
  const officer = b.currentOfficers.find((o) => o.title === 'President')?.name ?? b.currentDirectors[0]?.name ?? '';
  const built = def.build({ legalName: b.name, j: b.j, date, params, officer });
  return Page(c, {
    title: def.label,
    crumbs: [['Companies', '/companies'], [b.name, `/companies/${b.company.id}?tab=files`], ['New document']],
    children: (
      <>
        <form method="get" class="card">
          <input type="hidden" name="kind" value={def.kind} />
          <h2>Details</h2>
          <p class="small muted">{def.description}</p>
          <div class="fields">
            {def.params.map((p) => (p.type === 'textarea' ? <Area label={p.label} name={p.name} value={params[p.name]} /> : <Field label={p.label} name={p.name} type={p.type ?? 'text'} value={params[p.name]} placeholder={p.name === 'governing_law' ? (b.j.code === 'CA' ? 'Ontario' : b.j.longName) : undefined} />))}
            <Field label="Document date" name="date" type="date" value={date} />
          </div>
          <button class="btn sm" style="margin-top:10px">Update draft</button>
        </form>
        <form method="post" action={`/companies/${b.company.id}/files/generate`} class="card stack">
          <input type="hidden" name="kind" value={def.kind} />
          <div class="fields">
            <Field label="Title" name="title" value={built.title} required />
            <Field label="Document date" name="doc_date" type="date" value={date} />
            <Select label="Category" name="category" value={def.category} options={DOC_CATEGORIES} />
          </div>
          <Area label="Text" name="body" value={built.body} rows={26} />
          <label class="check"><input type="checkbox" name="in_minute_book" value="1" checked={def.category === 'minute_book' || def.category === 'shares'} /> Part of the minute book</label>
          <p class="small muted">This template is a starting point. Review it, and have a lawyer check it where appropriate, before anyone signs.</p>
          <div class="row"><button class="btn primary">Save document</button><a class="btn" href={`/companies/${b.company.id}?tab=files`}>Cancel</a></div>
        </form>
      </>
    ),
  });
});

app.post('/:id/files/generate', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.title) || !s(f.body)) return redirect(c, `/companies/${co.id}?tab=files`, 'error', 'Title and text are required.');
  const id = newId();
  const category = DOC_CATEGORIES.some(([k]) => k === s(f.category)) ? s(f.category) : 'other';
  await batch(db, [
    stmt(db, 'INSERT INTO documents (id, company_id, title, category, body, template, doc_date, in_minute_book, created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      id, co.id, s(f.title), category, s(f.body), s(f.kind), isIso(s(f.doc_date)) ? s(f.doc_date) : today(), s(f.in_minute_book) === '1', c.get('user').id),
    logStmt(db, c.get('user').id, `Created document: ${s(f.title)}`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}/files/${id}`, 'ok', 'Document saved.');
});

app.get('/:id/files/:fid', async (c) => {
  const db = c.env.DB;
  const doc = await first<Doc>(db, 'SELECT * FROM documents WHERE id = ? AND company_id = ?', c.req.param('fid'), c.req.param('id'));
  if (!doc) return c.notFound();
  if (doc.file_key) {
    const obj = await c.env.FILES.get(doc.file_key);
    if (!obj) return c.text('The file is missing from storage.', 404);
    const type = doc.content_type ?? 'application/octet-stream';
    const inline = INLINE_TYPES.has(type) && !c.req.query('download');
    const fname = (doc.file_name ?? 'file').replace(/["\\\r\n]/g, '_');
    return new Response(obj.body, {
      headers: {
        'content-type': INLINE_TYPES.has(type) ? type : 'application/octet-stream',
        'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${fname}"`,
        'content-security-policy': "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      },
    });
  }
  const co = await company(db, doc.company_id!);
  return DocPage(c, {
    title: doc.title,
    back: `/companies/${doc.company_id}?tab=files`,
    tools: <Post action={`/companies/${doc.company_id}/files/${doc.id}/delete`} confirm="Delete this document?"><button class="btn danger">Delete</button></Post>,
    children: <><div class="small" style="text-align:right;color:#666">{co ? displayName(co) : ''}{doc.doc_date ? ` · ${human(doc.doc_date)}` : ''}</div><div class="body">{doc.body}</div></>,
  });
});

app.post('/:id/files/:fid/minute-book', async (c) => {
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE documents SET in_minute_book = 1 - in_minute_book WHERE id = ? AND company_id = ?', c.req.param('fid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=files`, 'ok', 'Updated.');
});

app.post('/:id/files/:fid/delete', async (c) => {
  const db = c.env.DB;
  const doc = await first<Doc>(db, 'SELECT * FROM documents WHERE id = ? AND company_id = ?', c.req.param('fid'), c.req.param('id'));
  if (!doc) return c.notFound();
  if (doc.file_key) await c.env.FILES.delete(doc.file_key);
  await batch(db, [stmt(db, 'DELETE FROM documents WHERE id = ?', doc.id), logStmt(db, c.get('user').id, `Deleted document: ${doc.title}`, { companyId: doc.company_id })]);
  return redirect(c, `/companies/${doc.company_id}?tab=files`, 'ok', 'Document deleted.');
});

// ============================================================ ISC individuals
app.post('/:id/isc', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.name)) return redirect(c, `/companies/${co.id}?tab=people`, 'error', 'Name is required.');
  await batch(db, [
    stmt(db, 'INSERT INTO isc_individuals (id, company_id, name, address, birth_date, tax_residence, control_description, became_on) VALUES (?,?,?,?,?,?,?,?)',
      newId(), co.id, s(f.name), s(f.address), isIso(s(f.birth_date)) ? s(f.birth_date) : null, s(f.tax_residence), s(f.control_description), isIso(s(f.became_on)) ? s(f.became_on) : null),
    logStmt(db, c.get('user').id, `${s(f.name)} added as an individual with significant control`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=people`, 'ok', 'Individual added to the ISC register.');
});
app.post('/:id/isc/:iid/cease', async (c) => {
  const f = await readForm(c);
  if (!isIso(s(f.date))) return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'error', 'Enter a valid date.');
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE isc_individuals SET ceased_on = ? WHERE id = ? AND company_id = ?', s(f.date), c.req.param('iid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'ok', 'Updated.');
});
app.post('/:id/isc/:iid/delete', async (c) => {
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM isc_individuals WHERE id = ? AND company_id = ?', c.req.param('iid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'ok', 'Deleted.');
});

// ============================================================ Employees & contractors
app.post('/:id/workers', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  const kind = s(f.kind) === 'contractor' ? 'contractor' : 'employee';
  if (!s(f.name)) return redirect(c, `/companies/${co.id}?tab=team`, 'error', 'Name is required.');
  await batch(db, [
    stmt(db, 'INSERT INTO workers (id, company_id, kind, name, email, title, start_date, compensation, notes) VALUES (?,?,?,?,?,?,?,?,?)',
      newId(), co.id, kind, s(f.name), s(f.email), s(f.title), isIso(s(f.start_date)) ? s(f.start_date) : null, s(f.compensation), s(f.notes)),
    logStmt(db, c.get('user').id, `${s(f.name)} added as ${kind}`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=team`, 'ok', `${kind === 'employee' ? 'Employee' : 'Contractor'} added.`);
});
app.post('/:id/workers/:wid/end', async (c) => {
  const f = await readForm(c);
  if (!isIso(s(f.date))) return redirect(c, `/companies/${c.req.param('id')}?tab=team`, 'error', 'Enter a valid date.');
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE workers SET end_date = ? WHERE id = ? AND company_id = ?', s(f.date), c.req.param('wid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=team`, 'ok', 'Updated.');
});
app.post('/:id/workers/:wid/delete', async (c) => {
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM workers WHERE id = ? AND company_id = ?', c.req.param('wid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=team`, 'ok', 'Deleted.');
});

// ============================================================ Convertibles
app.post('/:id/convertibles', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const back = `/companies/${co.id}?tab=financing`;
  const f = await readForm(c);
  const kind = s(f.kind) === 'note' ? 'note' : 'safe';
  const amount = num(f.amount);
  if (!s(f.investor) || !isIso(s(f.issue_date)) || amount == null || amount <= 0) return redirect(c, back, 'error', 'Investor, issue date and a positive amount are required.');
  await batch(db, [
    stmt(db, 'INSERT INTO convertibles (id, company_id, kind, certificate_number, investor, issue_date, amount, interest_rate, valuation_cap, discount_rate, maturity_date, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      newId(), co.id, kind, s(f.certificate_number), s(f.investor), s(f.issue_date), amount, kind === 'note' ? num(f.interest_rate) : null, num(f.valuation_cap), num(f.discount_rate), kind === 'note' && isIso(s(f.maturity_date)) ? s(f.maturity_date) : null, s(f.notes)),
    logStmt(db, c.get('user').id, `${kind === 'safe' ? 'SAFE' : 'Convertible note'} of ${money(amount)} issued to ${s(f.investor)}`, { companyId: co.id }),
  ]);
  return redirect(c, back, 'ok', 'Convertible recorded.');
});
app.post('/:id/convertibles/:cid/status', async (c) => {
  const f = await readForm(c);
  const st = s(f.status);
  if (['outstanding', 'converted', 'repaid', 'cancelled'].includes(st)) await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE convertibles SET status = ? WHERE id = ? AND company_id = ?', st, c.req.param('cid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=financing`, 'ok', 'Status updated.');
});
app.post('/:id/convertibles/:cid/delete', async (c) => {
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM convertibles WHERE id = ? AND company_id = ?', c.req.param('cid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=financing`, 'ok', 'Deleted.');
});

// ============================================================ Option plans & grants
app.post('/:id/option-plans', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  const pool = num(f.pool_size);
  if (!s(f.name) || pool == null || pool < 1 || !Number.isInteger(pool)) return redirect(c, `/companies/${co.id}?tab=financing`, 'error', 'Plan name and a whole-number pool size are required.');
  await batch(db, [
    stmt(db, 'INSERT INTO option_plans (id, company_id, name, share_class_id, pool_size, approved_on) VALUES (?,?,?,?,?,?)', newId(), co.id, s(f.name), s(f.share_class_id), pool, isIso(s(f.approved_on)) ? s(f.approved_on) : null),
    logStmt(db, c.get('user').id, `Option plan "${s(f.name)}" created with a pool of ${pool.toLocaleString()}`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=financing`, 'ok', 'Option plan created.');
});
app.post('/:id/option-grants', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const back = `/companies/${co.id}?tab=financing`;
  const f = await readForm(c);
  const plan = await first<{ id: string; pool_size: number }>(db, 'SELECT id, pool_size FROM option_plans WHERE id = ? AND company_id = ?', s(f.plan_id), co.id);
  if (!plan) return redirect(c, back, 'error', 'Choose an option plan.');
  const qty = num(f.quantity);
  if (!s(f.holder) || qty == null || qty < 1 || !Number.isInteger(qty) || !isIso(s(f.grant_date))) return redirect(c, back, 'error', 'Holder, a whole number of options and a grant date are required.');
  const used = await first<{ n: number }>(db, "SELECT COALESCE(SUM(quantity),0) AS n FROM option_grants WHERE plan_id = ? AND status = 'active'", plan.id);
  if ((used?.n ?? 0) + qty > plan.pool_size) return redirect(c, back, 'error', `Only ${(plan.pool_size - (used?.n ?? 0)).toLocaleString()} options remain in this pool.`);
  await batch(db, [
    stmt(db, 'INSERT INTO option_grants (id, plan_id, company_id, holder, quantity, exercise_price, grant_date, vesting_start, vesting_months, cliff_months, expiry_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      newId(), plan.id, co.id, s(f.holder), qty, num(f.exercise_price) ?? 0, s(f.grant_date), isIso(s(f.vesting_start)) ? s(f.vesting_start) : null, Math.max(0, Math.floor(num(f.vesting_months) ?? 48)), Math.max(0, Math.floor(num(f.cliff_months) ?? 12)), isIso(s(f.expiry_date)) ? s(f.expiry_date) : null),
    logStmt(db, c.get('user').id, `${qty.toLocaleString()} options granted to ${s(f.holder)}`, { companyId: co.id }),
  ]);
  return redirect(c, back, 'ok', 'Options granted.');
});
app.post('/:id/option-grants/:gid/status', async (c) => {
  const f = await readForm(c);
  const st = s(f.status);
  if (['active', 'exercised', 'cancelled', 'expired'].includes(st)) await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE option_grants SET status = ? WHERE id = ? AND company_id = ?', st, c.req.param('gid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=financing`, 'ok', 'Status updated.');
});

// ============================================================ Cap table export
app.get('/:id/cap-table.csv', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  if (!b) return c.notFound();
  const cap = capTable(b.shareholders, b.classes, b.txs);
  const esc = (v: string | number) => {
    const str = String(v);
    const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str; // block spreadsheet formula injection
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const lines = [
    ['Shareholder', 'Type', 'Email', ...b.classes.map((cl) => cl.name), 'Total', 'Equity %', 'Voting %'],
    ...cap.rows.map((r) => [r.shareholder.name, r.shareholder.kind, r.shareholder.email ?? '', ...b.classes.map((cl) => r.byClass[cl.id] || 0), r.total, r.pctEquity.toFixed(4), r.pctVoting.toFixed(4)]),
    ['Outstanding', '', '', ...b.classes.map((cl) => cap.classTotals[cl.id]), cap.total, '100', cap.votingTotal ? '100' : ''],
  ];
  const csv = lines.map((l) => l.map(esc).join(',')).join('\r\n');
  const fname = `${b.name.replace(/[^\w]+/g, '-')}-cap-table-${today()}.csv`;
  return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${fname}"` });
});

export default app;
