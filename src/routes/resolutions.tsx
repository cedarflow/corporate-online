import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { batch, first, logStmt, newId, stmt } from '../lib/db.ts';
import { human, isIso, today } from '../lib/dates.ts';
import { capTable } from '../lib/captable.ts';
import { getTemplate } from '../lib/resolutions.ts';
import { loadCompany, type CompanyBundle } from '../lib/company.ts';
import type { Resolution } from '../lib/types.ts';
import { readForm, redirect, s } from '../http.ts';
import { Area, Field, Page, Post } from '../views/layout.tsx';
import { DocPage } from '../views/doc.tsx';

const app = new Hono<AppEnv>();

/** People who sign: current directors, or shareholders holding voting shares. */
export function signatories(b: CompanyBundle, bodyType: 'directors' | 'shareholders'): string[] {
  if (bodyType === 'directors') return b.currentDirectors.map((d) => d.name);
  const cap = capTable(b.shareholders, b.classes, b.txs);
  return cap.rows.filter((r) => r.total > 0).map((r) => r.shareholder.name);
}

app.get('/:id/resolutions/new', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  if (!b) return c.notFound();
  const tpl = getTemplate(c.req.query('kind') ?? 'custom') ?? getTemplate('custom')!;
  const params: Record<string, string> = {};
  for (const p of tpl.params ?? []) params[p.name] = c.req.query(p.name) ?? '';
  const date = isIso(c.req.query('date')) ? c.req.query('date')! : today();
  const built = tpl.build({ company: b.company, j: b.j, legalName: b.name, directors: b.currentDirectors, officers: b.currentOfficers, shareholders: b.shareholders, classes: b.classes, txs: b.txs, date, params });
  return Page(c, {
    title: tpl.label,
    crumbs: [['Companies', '/companies'], [b.name, `/companies/${b.company.id}?tab=resolutions`], ['New resolution']],
    children: (
      <>
        {tpl.params?.length ? (
          <form method="get" class="card">
            <input type="hidden" name="kind" value={tpl.kind} />
            <h2>Details</h2>
            <div class="fields">
              {tpl.params.map((p) => <Field label={p.label} name={p.name} type={p.type ?? 'text'} value={params[p.name]} />)}
              <Field label="Resolution date" name="date" type="date" value={date} />
            </div>
            <button class="btn sm" style="margin-top:10px">Update draft</button>
          </form>
        ) : null}
        <form method="post" action={`/companies/${b.company.id}/resolutions`} class="card stack">
          <input type="hidden" name="kind" value={tpl.kind} />
          <div class="fields">
            <Field label="Title" name="title" value={built.title} required />
            <div>
              <label>Passed by</label>
              <select name="body_type">
                <option value="directors" selected={tpl.body_type === 'directors'}>Directors</option>
                <option value="shareholders" selected={tpl.body_type === 'shareholders'}>Shareholders</option>
              </select>
            </div>
            <Field label="Resolution date" name="resolution_date" type="date" value={date} required />
          </div>
          <Area label="Text" name="body" value={built.body} rows={22} />
          <p class="small muted">Templates are starting points for staff. Have the final wording reviewed before it is signed.</p>
          <div class="row"><button class="btn primary">Save draft</button><a class="btn" href={`/companies/${b.company.id}?tab=resolutions`}>Cancel</a></div>
        </form>
      </>
    ),
  });
});

app.post('/:id/resolutions', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const co = await first<{ id: string; legal_name: string | null }>(db, 'SELECT id, legal_name FROM companies WHERE id = ?', id);
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.title) || !s(f.body) || !isIso(s(f.resolution_date))) return redirect(c, `/companies/${id}?tab=resolutions`, 'error', 'Title, text and a valid date are required.');
  const rid = newId();
  const bodyType = s(f.body_type) === 'shareholders' ? 'shareholders' : 'directors';
  await batch(db, [
    stmt(db, 'INSERT INTO resolutions (id, company_id, kind, body_type, title, body, resolution_date, created_by) VALUES (?,?,?,?,?,?,?,?)', rid, id, s(f.kind) || 'custom', bodyType, s(f.title), s(f.body), s(f.resolution_date), c.get('user').id),
    logStmt(db, c.get('user').id, `Drafted resolution: ${s(f.title)}`, { companyId: id }),
  ]);
  return redirect(c, `/companies/${id}/resolutions/${rid}`, 'ok', 'Resolution saved as a draft.');
});

app.get('/:id/resolutions/:rid', async (c) => {
  const b = await loadCompany(c.env.DB, c.req.param('id'));
  const r = b?.resolutions.find((x) => x.id === c.req.param('rid'));
  if (!b || !r) return c.notFound();
  if (c.req.query('edit')) {
    return Page(c, {
      title: 'Edit resolution',
      crumbs: [['Companies', '/companies'], [b.name, `/companies/${b.company.id}?tab=resolutions`], ['Edit']],
      children: (
        <form method="post" action={`/companies/${b.company.id}/resolutions/${r.id}/edit`} class="card stack">
          <div class="fields"><Field label="Title" name="title" value={r.title} required /><Field label="Resolution date" name="resolution_date" type="date" value={r.resolution_date} required /></div>
          <Area label="Text" name="body" value={r.body} rows={22} />
          <div class="row"><button class="btn primary">Save</button><a class="btn" href={`/companies/${b.company.id}/resolutions/${r.id}`}>Cancel</a></div>
        </form>
      ),
    });
  }
  const back = `/companies/${b.company.id}?tab=resolutions`;
  return DocPage(c, {
    title: r.title,
    back,
    tools: (
      <>
        {!r.signed_on ? <a class="btn" href={`?edit=1`}>Edit</a> : null}
        {!r.signed_on
          ? <Post action={`/companies/${b.company.id}/resolutions/${r.id}/sign`}><input type="date" name="signed_on" value={today()} style="width:auto" /> <button class="btn">Mark signed</button></Post>
          : <span class="badge b-ok" style="align-self:center">Signed {human(r.signed_on)}</span>}
        <Post action={`/companies/${b.company.id}/resolutions/${r.id}/delete`} confirm="Delete this resolution?"><button class="btn danger">Delete</button></Post>
      </>
    ),
    children: <ResolutionDoc b={b} r={r} />,
  });
});

export const ResolutionDoc = ({ b, r }: { b: CompanyBundle; r: Resolution }) => (
  <>
    <div class="body">{r.body}</div>
    <p style="margin-top:24px">DATED {human(r.resolution_date).toUpperCase()}.</p>
    <div class="sigs">
      {signatories(b, r.body_type).map((n) => <div class="sig">{n}</div>)}
    </div>
  </>
);

app.post('/:id/resolutions/:rid/edit', async (c) => {
  const f = await readForm(c);
  const { id, rid } = c.req.param();
  if (!s(f.title) || !s(f.body) || !isIso(s(f.resolution_date))) return redirect(c, `/companies/${id}/resolutions/${rid}?edit=1`, 'error', 'Title, text and a valid date are required.');
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE resolutions SET title = ?, body = ?, resolution_date = ? WHERE id = ? AND company_id = ? AND signed_on IS NULL', s(f.title), s(f.body), s(f.resolution_date), rid, id)]);
  return redirect(c, `/companies/${id}/resolutions/${rid}`, 'ok', 'Resolution updated.');
});
app.post('/:id/resolutions/:rid/sign', async (c) => {
  const f = await readForm(c);
  const { id, rid } = c.req.param();
  const date = isIso(s(f.signed_on)) ? s(f.signed_on) : today();
  const r = await first<Resolution>(c.env.DB, 'SELECT * FROM resolutions WHERE id = ? AND company_id = ?', rid, id);
  if (!r) return c.notFound();
  await batch(c.env.DB, [
    stmt(c.env.DB, 'UPDATE resolutions SET signed_on = ? WHERE id = ?', date, rid),
    logStmt(c.env.DB, c.get('user').id, `Resolution signed: ${r.title}`, { companyId: id }),
  ]);
  return redirect(c, `/companies/${id}/resolutions/${rid}`, 'ok', 'Marked as signed and filed in the minute book.');
});
app.post('/:id/resolutions/:rid/delete', async (c) => {
  const { id, rid } = c.req.param();
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM resolutions WHERE id = ? AND company_id = ?', rid, id)]);
  return redirect(c, `/companies/${id}?tab=resolutions`, 'ok', 'Resolution deleted.');
});

export default app;
