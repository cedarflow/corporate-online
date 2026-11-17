import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, logStmt, stmt } from '../lib/db.ts';
import { addDays, today } from '../lib/dates.ts';
import { complianceStatements, displayName } from '../lib/company.ts';
import type { Company, ComplianceItem } from '../lib/types.ts';
import { readForm, redirect, safeBack } from '../http.ts';
import { D, DueBadge, Empty, Page, Post } from '../views/layout.tsx';

const app = new Hono<AppEnv>();

const VIEWS: [string, string][] = [['upcoming', 'Next 90 days'], ['overdue', 'Overdue'], ['all', 'All open'], ['done', 'Completed']];

app.get('/', async (c) => {
  const view = VIEWS.some(([k]) => k === c.req.query('view')) ? c.req.query('view')! : 'upcoming';
  const t = today();
  const cond = {
    upcoming: ['ci.completed_on IS NULL AND ci.due_date <= ?', addDays(t, 90)],
    overdue: ['ci.completed_on IS NULL AND ci.due_date < ?', t],
    all: ['ci.completed_on IS NULL', null],
    done: ['ci.completed_on IS NOT NULL', null],
  }[view] as [string, string | null];
  const rows = await all<ComplianceItem & { co_name: string | null; co_type: string | null; co_j: string | null; bn_name: string | null }>(c.env.DB, `
    SELECT ci.*, co.legal_name AS co_name, co.name_type AS co_type, co.jurisdiction AS co_j, bn.name AS bn_name
    FROM compliance_items ci
    LEFT JOIN companies co ON co.id = ci.company_id
    LEFT JOIN business_names bn ON bn.id = ci.business_name_id
    WHERE ${cond[0]} ORDER BY ${view === 'done' ? 'ci.completed_on DESC' : 'ci.due_date'} LIMIT 1000`, ...(cond[1] ? [cond[1]] : []));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = (view === 'done' ? r.completed_on! : r.due_date).slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const back = `/compliance?view=${view}`;

  return Page(c, {
    title: 'Compliance calendar',
    sub: <p class="muted">Annual returns, CRA deadlines, annual resolutions and business name renewals across all clients.</p>,
    children: (
      <>
        <nav class="tabs">{VIEWS.map(([k, l]) => <a href={`/compliance?view=${k}`} class={k === view ? 'on' : ''}>{l}</a>)}</nav>
        {rows.length ? [...groups].map(([k, items]) => (
          <div class="card flush">
            <h2>{monthLabel(k)}</h2>
            <table>
              <tbody>
                {items.map((x) => (
                  <tr class={x.completed_on ? 'done' : ''}>
                    <td style="width:120px"><D d={x.due_date} /></td>
                    <td>
                      <span class="t">{x.title}</span>
                      <div class="small muted">
                        {x.company_id
                          ? <a href={`/companies/${x.company_id}?tab=compliance`}>{displayName({ legal_name: x.co_name, name_type: (x.co_type ?? 'named') as Company['name_type'], jurisdiction: x.co_j ?? '', distinctive: null, descriptive: null, legal_ending: null, corp_number: null })}</a>
                          : <a href={`/business-names/${x.business_name_id}`}>{x.bn_name}</a>}
                      </div>
                    </td>
                    <td style="width:110px"><DueBadge item={x} today={t} /></td>
                    <td class="num" style="width:130px">
                      {x.completed_on
                        ? <Post action={`/compliance/${x.id}/reopen`}><input type="hidden" name="back" value={back} /><button class="btn sm link">Reopen</button></Post>
                        : <Post action={`/compliance/${x.id}/complete`}><input type="hidden" name="back" value={back} /><button class="btn sm">Mark filed</button></Post>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : <div class="card"><Empty>{view === 'overdue' ? 'Nothing overdue. Nice.' : 'Nothing here.'}</Empty></div>}
      </>
    ),
  });
});

app.post('/:id/complete', async (c) => {
  const db = c.env.DB;
  const f = await readForm(c);
  const item = await first<ComplianceItem>(db, 'SELECT * FROM compliance_items WHERE id = ?', c.req.param('id'));
  if (!item) return c.notFound();
  const stmts = [stmt(db, 'UPDATE compliance_items SET completed_on = ? WHERE id = ?', today(), item.id)];
  if (item.company_id) {
    // Roll the schedule forward so next year's obligation appears.
    const co = await first<Company>(db, 'SELECT * FROM companies WHERE id = ?', item.company_id);
    if (co) stmts.push(...complianceStatements(db, co, today()));
  }
  stmts.push(logStmt(db, c.get('user').id, `Completed: ${item.title}`, { companyId: item.company_id }));
  await batch(db, stmts);
  return redirect(c, safeBack(f.back, '/compliance'), 'ok', `Marked "${item.title}" as filed.`);
});

app.post('/:id/reopen', async (c) => {
  const f = await readForm(c);
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE compliance_items SET completed_on = NULL WHERE id = ?', c.req.param('id'))]);
  return redirect(c, safeBack(f.back, '/compliance'), 'ok', 'Reopened.');
});

export default app;
