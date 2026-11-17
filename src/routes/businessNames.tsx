// Business name registrations (sole proprietorships / partnerships / operating names).
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, logStmt, newId, stmt } from '../lib/db.ts';
import { addMonths, addDays, isIso, today } from '../lib/dates.ts';
import { getJurisdiction, jurisdictionList } from '../lib/jurisdictions.ts';
import type { BusinessName, Client, ComplianceItem } from '../lib/types.ts';
import { readForm, redirect, s } from '../http.ts';
import { Area, D, DueBadge, Empty, Field, Page, Post, Select } from '../views/layout.tsx';

const app = new Hono<AppEnv>();
const BN_JURISDICTIONS = jurisdictionList().filter((j) => j.code !== 'CA');
const STATUS_BADGE: Record<string, string> = { pending: 'b-info', active: 'b-ok', expired: 'b-bad', cancelled: '' };

function expiry(jur: string, registeredOn: string | null): string | null {
  const term = getJurisdiction(jur)?.businessNameTermYears;
  return term && registeredOn ? addDays(addMonths(registeredOn, term * 12), -1) : null;
}
function renewalStmt(db: D1Database, bnId: string, name: string, expiresOn: string | null) {
  return expiresOn ? [stmt(db, "INSERT OR IGNORE INTO compliance_items (id, business_name_id, kind, title, due_date, notes, auto) VALUES (?,?,'bn_renewal',?,?,?,1)", newId(), bnId, `Renew business name: ${name}`, expiresOn, 'Registration lapses if not renewed by the expiry date.')] : [];
}

app.get('/', async (c) => {
  const rows = await all<BusinessName & { client_name: string | null }>(c.env.DB, 'SELECT bn.*, cl.name AS client_name FROM business_names bn LEFT JOIN clients cl ON cl.id = bn.client_id ORDER BY bn.status = \'active\' DESC, bn.expires_on, bn.name');
  const t = today();
  return Page(c, {
    title: 'Business names',
    sub: <p class="muted">Registrations for sole proprietors, partnerships and operating names. Ontario registrations expire after 5 years.</p>,
    actions: <a class="btn primary" href="/business-names/new">Register a name</a>,
    children: (
      <div class="card flush">
        {rows.length ? (
          <table>
            <thead><tr><th>Name</th><th>Client</th><th>Jurisdiction</th><th>Status</th><th>Registered</th><th>Expires</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr>
                <td><a href={`/business-names/${r.id}`}><strong>{r.name}</strong></a>{r.registration_number ? <div class="small muted mono">#{r.registration_number}</div> : null}</td>
                <td>{r.client_id ? <a href={`/clients/${r.client_id}`}>{r.client_name}</a> : '—'}</td>
                <td>{getJurisdiction(r.jurisdiction)?.name ?? r.jurisdiction}</td>
                <td><span class={`badge ${STATUS_BADGE[r.status] ?? ''}`}>{r.status}</span></td>
                <td><D d={r.registered_on} /></td>
                <td>{r.expires_on ? <><D d={r.expires_on} /> {r.status === 'active' ? <DueBadge item={{ due_date: r.expires_on, completed_on: null }} today={t} /> : null}</> : <span class="muted">No expiry</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <Empty>No business names registered yet.</Empty>}
      </div>
    ),
  });
});

app.get('/new', async (c) => {
  const clients = await all<Client>(c.env.DB, 'SELECT id, name FROM clients ORDER BY name');
  return Page(c, {
    title: 'Register a business name',
    crumbs: [['Business names', '/business-names'], ['New']],
    children: (
      <form method="post" action="/business-names" class="card stack">
        <div class="fields">
          <Select label="Client" name="client_id" value={c.req.query('client')} options={clients.map((cl) => [cl.id, cl.name])} required blank="Choose a client" />
          <Field label="Business name" name="name" required />
          <Select label="Jurisdiction" name="jurisdiction" value="ON" options={BN_JURISDICTIONS.map((j) => [j.code, j.longName])} />
          <Select label="Status" name="status" value="pending" options={[['pending', 'Pending (not yet filed)'], ['active', 'Registered']]} />
          <Field label="Registration #" name="registration_number" />
          <Field label="Registration date" name="registered_on" type="date" hint="expiry is calculated" />
        </div>
        <Field label="Business activity" name="activity" />
        <Area label="Business address" name="address" />
        <div class="row"><button class="btn primary">Save</button><a class="btn" href="/business-names">Cancel</a></div>
      </form>
    ),
  });
});

app.post('/', async (c) => {
  const db = c.env.DB;
  const f = await readForm(c);
  const j = getJurisdiction(s(f.jurisdiction));
  if (!s(f.name) || !j || !s(f.client_id)) return redirect(c, '/business-names/new', 'error', 'Client, name and jurisdiction are required.');
  const reg = isIso(s(f.registered_on)) ? s(f.registered_on) : null;
  const status = s(f.status) === 'active' || reg ? 'active' : 'pending';
  const exp = expiry(j.code, reg);
  const id = newId();
  await batch(db, [
    stmt(db, 'INSERT INTO business_names (id, client_id, name, jurisdiction, registration_number, registered_on, expires_on, activity, address, status) VALUES (?,?,?,?,?,?,?,?,?,?)', id, s(f.client_id), s(f.name), j.code, s(f.registration_number), reg, exp, s(f.activity), s(f.address), status),
    ...renewalStmt(db, id, s(f.name), exp),
    logStmt(db, c.get('user').id, `Business name ${status === 'active' ? 'registered' : 'opened'}: ${s(f.name)}`, { clientId: s(f.client_id) }),
  ]);
  return redirect(c, `/business-names/${id}`, 'ok', 'Business name saved.');
});

app.get('/:id', async (c) => {
  const bn = await first<BusinessName & { client_name: string | null }>(c.env.DB, 'SELECT bn.*, cl.name AS client_name FROM business_names bn LEFT JOIN clients cl ON cl.id = bn.client_id WHERE bn.id = ?', c.req.param('id'));
  if (!bn) return c.notFound();
  const items = await all<ComplianceItem>(c.env.DB, 'SELECT * FROM compliance_items WHERE business_name_id = ? ORDER BY due_date DESC', bn.id);
  const t = today();
  const term = getJurisdiction(bn.jurisdiction)?.businessNameTermYears;
  return Page(c, {
    title: bn.name,
    crumbs: [['Business names', '/business-names'], [bn.name]],
    sub: <div class="row"><span class={`badge ${STATUS_BADGE[bn.status] ?? ''}`}>{bn.status}</span><span class="muted small">{getJurisdiction(bn.jurisdiction)?.longName}</span></div>,
    children: (
      <div class="grid g2">
        <div class="card">
          <h2>Registration</h2>
          <dl class="kv">
            <dt>Client</dt><dd>{bn.client_id ? <a href={`/clients/${bn.client_id}`}>{bn.client_name}</a> : '—'}</dd>
            <dt>Registration #</dt><dd>{bn.registration_number || '—'}</dd>
            <dt>Registered</dt><dd><D d={bn.registered_on} /></dd>
            <dt>Expires</dt><dd>{bn.expires_on ? <D d={bn.expires_on} /> : 'No expiry in this jurisdiction'}</dd>
            <dt>Activity</dt><dd>{bn.activity || '—'}</dd>
            <dt>Address</dt><dd>{bn.address || '—'}</dd>
          </dl>
        </div>
        <div>
          <div class="card">
            <h2>Update</h2>
            <form method="post" action={`/business-names/${bn.id}`} class="stack">
              <div class="fields">
                <Select label="Status" name="status" value={bn.status} options={[['pending', 'Pending'], ['active', 'Active'], ['expired', 'Expired'], ['cancelled', 'Cancelled']]} />
                <Field label="Registration #" name="registration_number" value={bn.registration_number} />
                <Field label="Registration date" name="registered_on" type="date" value={bn.registered_on} />
              </div>
              <button class="btn primary sm">Save</button>
            </form>
            {term && bn.status === 'active' && bn.expires_on ? (
              <Post action={`/business-names/${bn.id}/renew`} inline={false}>
                <p class="small muted" style="margin-top:14px">Renewing extends the registration {term} years from the current expiry.</p>
                <button class="btn sm">Record renewal</button>
              </Post>
            ) : null}
          </div>
          <div class="card flush">
            <h2>Renewals</h2>
            {items.length ? <table><tbody>{items.map((x) => <tr><td>{x.title}</td><td><D d={x.due_date} /></td><td><DueBadge item={x} today={t} /></td></tr>)}</tbody></table> : <Empty>No renewal deadlines.</Empty>}
          </div>
        </div>
      </div>
    ),
  });
});

app.post('/:id', async (c) => {
  const db = c.env.DB;
  const bn = await first<BusinessName>(db, 'SELECT * FROM business_names WHERE id = ?', c.req.param('id'));
  if (!bn) return c.notFound();
  const f = await readForm(c);
  const status = ['pending', 'active', 'expired', 'cancelled'].includes(s(f.status)) ? s(f.status) : bn.status;
  const reg = isIso(s(f.registered_on)) ? s(f.registered_on) : null;
  const exp = reg === bn.registered_on ? bn.expires_on : expiry(bn.jurisdiction, reg);
  await batch(db, [
    stmt(db, 'UPDATE business_names SET status = ?, registration_number = ?, registered_on = ?, expires_on = ? WHERE id = ?', status, s(f.registration_number), reg, exp, bn.id),
    ...(status === 'active' ? renewalStmt(db, bn.id, bn.name, exp) : []),
  ]);
  return redirect(c, `/business-names/${bn.id}`, 'ok', 'Saved.');
});

app.post('/:id/renew', async (c) => {
  const db = c.env.DB;
  const bn = await first<BusinessName>(db, 'SELECT * FROM business_names WHERE id = ?', c.req.param('id'));
  const term = bn ? getJurisdiction(bn.jurisdiction)?.businessNameTermYears : null;
  if (!bn || !term || !bn.expires_on) return c.notFound();
  const next = addMonths(bn.expires_on, term * 12);
  await batch(db, [
    stmt(db, "UPDATE compliance_items SET completed_on = ? WHERE business_name_id = ? AND completed_on IS NULL AND kind = 'bn_renewal'", today(), bn.id),
    stmt(db, 'UPDATE business_names SET expires_on = ?, status = \'active\' WHERE id = ?', next, bn.id),
    ...renewalStmt(db, bn.id, bn.name, next),
    logStmt(db, c.get('user').id, `Renewed business name ${bn.name} to ${next}`, { clientId: bn.client_id }),
  ]);
  return redirect(c, `/business-names/${bn.id}`, 'ok', 'Renewal recorded.');
});

export default app;
