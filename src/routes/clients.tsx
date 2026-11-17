import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, logStmt, newId, stmt } from '../lib/db.ts';
import { displayName } from '../lib/company.ts';
import { getJurisdiction } from '../lib/jurisdictions.ts';
import type { BusinessName, Client, Company, User } from '../lib/types.ts';
import { readForm, redirect, s } from '../http.ts';
import { Area, D, Empty, Field, Page, Post, Select, StatusBadge } from '../views/layout.tsx';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  const rows = await all<Client & { companies: number; owner_name: string | null }>(c.env.DB, `
    SELECT cl.*, u.name AS owner_name, (SELECT COUNT(*) FROM companies co WHERE co.client_id = cl.id) AS companies
    FROM clients cl LEFT JOIN users u ON u.id = cl.owner_id
    ${q ? 'WHERE cl.name LIKE ?1 OR cl.email LIKE ?1 OR cl.phone LIKE ?1' : ''}
    ORDER BY cl.name LIMIT 500`, ...(q ? [`%${q}%`] : []));
  return Page(c, {
    title: 'Clients',
    actions: <a class="btn primary" href="/clients/new">New client</a>,
    children: (
      <>
        <form class="filters" method="get"><input name="q" value={q} placeholder="Search clients" /><button class="btn">Search</button></form>
        <div class="card flush">
          {rows.length ? (
            <table>
              <thead><tr><th>Client</th><th>Contact</th><th class="num">Companies</th><th>Account owner</th></tr></thead>
              <tbody>{rows.map((r) => <tr><td><a href={`/clients/${r.id}`}><strong>{r.name}</strong></a></td><td>{r.email}<div class="small muted">{r.phone}</div></td><td class="num">{r.companies}</td><td>{r.owner_name ?? '—'}</td></tr>)}</tbody>
            </table>
          ) : <Empty>No clients yet. <a href="/clients/new">Add one</a>.</Empty>}
        </div>
      </>
    ),
  });
});

const ClientForm = ({ cl, users, action }: { cl?: Client; users: User[]; action: string }) => (
  <form method="post" action={action} class="card stack">
    <div class="fields">
      <Field label="Name" name="name" value={cl?.name} required hint="person or organization" />
      <Field label="Email" name="email" type="email" value={cl?.email} />
      <Field label="Phone" name="phone" value={cl?.phone} />
      <Select label="Account owner" name="owner_id" value={cl?.owner_id} blank="— None —" options={users.map((u) => [u.id, u.name])} />
    </div>
    <Area label="Address" name="address" value={cl?.address} />
    <Area label="Notes" name="notes" value={cl?.notes} />
    <div class="row"><button class="btn primary">Save client</button><a class="btn" href={cl ? `/clients/${cl.id}` : '/clients'}>Cancel</a></div>
  </form>
);

app.get('/new', async (c) => {
  const users = await all<User>(c.env.DB, 'SELECT id, name FROM users WHERE active = 1 ORDER BY name');
  return Page(c, { title: 'New client', crumbs: [['Clients', '/clients'], ['New']], children: <ClientForm users={users} action="/clients" /> });
});
app.post('/', async (c) => {
  const f = await readForm(c);
  if (!s(f.name)) return redirect(c, '/clients/new', 'error', 'Name is required.');
  const id = newId();
  await batch(c.env.DB, [
    stmt(c.env.DB, 'INSERT INTO clients (id, name, email, phone, address, notes, owner_id) VALUES (?,?,?,?,?,?,?)', id, s(f.name), s(f.email), s(f.phone), s(f.address), s(f.notes), s(f.owner_id) || c.get('user').id),
    logStmt(c.env.DB, c.get('user').id, `Added client ${s(f.name)}`, { clientId: id }),
  ]);
  return redirect(c, `/clients/${id}`, 'ok', 'Client added.');
});

app.get('/:id', async (c) => {
  const db = c.env.DB;
  const cl = await first<Client & { owner_name: string | null }>(db, 'SELECT cl.*, u.name AS owner_name FROM clients cl LEFT JOIN users u ON u.id = cl.owner_id WHERE cl.id = ?', c.req.param('id'));
  if (!cl) return c.notFound();
  const [companies, names, activity] = await Promise.all([
    all<Company>(db, 'SELECT * FROM companies WHERE client_id = ? ORDER BY created_at DESC', cl.id),
    all<BusinessName>(db, 'SELECT * FROM business_names WHERE client_id = ? ORDER BY name', cl.id),
    all<{ message: string; created_at: string; company_id: string | null }>(db, 'SELECT a.message, a.created_at, a.company_id FROM activity a WHERE a.client_id = ? OR a.company_id IN (SELECT id FROM companies WHERE client_id = ?) ORDER BY a.created_at DESC LIMIT 15', cl.id, cl.id),
  ]);
  return Page(c, {
    title: cl.name,
    crumbs: [['Clients', '/clients'], [cl.name]],
    actions: <><a class="btn" href={`/clients/${cl.id}/edit`}>Edit</a><a class="btn" href={`/business-names/new?client=${cl.id}`}>Register business name</a><a class="btn primary" href={`/companies/new?client=${cl.id}`}>Incorporate</a></>,
    children: (
      <div class="grid g2">
        <div>
          <div class="card flush">
            <h2>Companies</h2>
            {companies.length ? <table><tbody>{companies.map((co) => <tr><td><a href={`/companies/${co.id}`}>{displayName(co)}</a><div class="small muted">{getJurisdiction(co.jurisdiction)?.name}</div></td><td class="num"><StatusBadge status={co.status} /></td></tr>)}</tbody></table> : <Empty>No companies for this client.</Empty>}
          </div>
          <div class="card flush">
            <h2>Business names</h2>
            {names.length ? <table><tbody>{names.map((n) => <tr><td><a href={`/business-names/${n.id}`}>{n.name}</a><div class="small muted">{n.jurisdiction}</div></td><td class="num">{n.expires_on ? <>Expires <D d={n.expires_on} /></> : <span class="badge">{n.status}</span>}</td></tr>)}</tbody></table> : <Empty>No business name registrations.</Empty>}
          </div>
        </div>
        <div>
          <div class="card">
            <h2>Contact</h2>
            <dl class="kv">
              <dt>Email</dt><dd>{cl.email ? <a href={`mailto:${cl.email}`}>{cl.email}</a> : '—'}</dd>
              <dt>Phone</dt><dd>{cl.phone || '—'}</dd>
              <dt>Address</dt><dd>{cl.address || '—'}</dd>
              <dt>Account owner</dt><dd>{cl.owner_name ?? '—'}</dd>
              {cl.notes ? <><dt>Notes</dt><dd>{cl.notes}</dd></> : null}
            </dl>
          </div>
          <div class="card">
            <h2>Activity</h2>
            {activity.length ? <ul class="list-plain">{activity.map((a) => <li>{a.message}<div class="small muted">{a.created_at.slice(0, 16)} UTC</div></li>)}</ul> : <p class="muted">No activity yet.</p>}
          </div>
        </div>
      </div>
    ),
  });
});

app.get('/:id/edit', async (c) => {
  const cl = await first<Client>(c.env.DB, 'SELECT * FROM clients WHERE id = ?', c.req.param('id'));
  if (!cl) return c.notFound();
  const users = await all<User>(c.env.DB, 'SELECT id, name FROM users WHERE active = 1 ORDER BY name');
  return Page(c, {
    title: `Edit ${cl.name}`,
    crumbs: [['Clients', '/clients'], [cl.name, `/clients/${cl.id}`], ['Edit']],
    children: (
      <>
        <ClientForm cl={cl} users={users} action={`/clients/${cl.id}/edit`} />
        {c.get('user').role === 'admin' ? <div class="card"><h2>Danger zone</h2><p class="small muted">Deleting a client keeps their companies but unlinks them.</p><Post action={`/clients/${cl.id}/delete`} confirm="Delete this client?"><button class="btn danger">Delete client</button></Post></div> : null}
      </>
    ),
  });
});
app.post('/:id/edit', async (c) => {
  const f = await readForm(c);
  const id = c.req.param('id');
  if (!s(f.name)) return redirect(c, `/clients/${id}/edit`, 'error', 'Name is required.');
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE clients SET name=?, email=?, phone=?, address=?, notes=?, owner_id=? WHERE id=?', s(f.name), s(f.email), s(f.phone), s(f.address), s(f.notes), s(f.owner_id), id)]);
  return redirect(c, `/clients/${id}`, 'ok', 'Client saved.');
});
app.post('/:id/delete', async (c) => {
  if (c.get('user').role !== 'admin') return redirect(c, `/clients/${c.req.param('id')}`, 'error', 'Only administrators can delete clients.');
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM clients WHERE id = ?', c.req.param('id'))]);
  return redirect(c, '/clients', 'ok', 'Client deleted.');
});

export default app;
