import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all } from '../lib/db.ts';
import { addDays, today } from '../lib/dates.ts';
import { STATUSES } from '../lib/statuses.ts';
import { displayName } from '../lib/company.ts';
import type { Company, ComplianceItem, Task } from '../lib/types.ts';
import { D, DueBadge, Empty, Page, StatusBadge } from '../views/layout.tsx';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const db = c.env.DB;
  const t = today();
  const user = c.get('user');
  const [counts, pipeline, due, myTasks, recent] = await Promise.all([
    all<{ k: string; n: number }>(db, `
      SELECT 'companies' AS k, COUNT(*) AS n FROM companies WHERE status != 'dissolved'
      UNION ALL SELECT 'clients', COUNT(*) FROM clients
      UNION ALL SELECT 'in_progress', COUNT(*) FROM companies WHERE status IN ('draft','name_review','ready_to_file','filed')
      UNION ALL SELECT 'overdue', COUNT(*) FROM compliance_items WHERE completed_on IS NULL AND due_date < ?
      UNION ALL SELECT 'due30', COUNT(*) FROM compliance_items WHERE completed_on IS NULL AND due_date BETWEEN ? AND ?`, t, t, addDays(t, 30)),
    all<Company>(db, "SELECT * FROM companies WHERE status IN ('draft','name_review','ready_to_file','filed') ORDER BY updated_at DESC LIMIT 12"),
    all<ComplianceItem & { co_name: string | null; co_type: string; co_j: string; bn_name: string | null }>(db, `
      SELECT ci.*, co.legal_name AS co_name, co.name_type AS co_type, co.jurisdiction AS co_j, bn.name AS bn_name
      FROM compliance_items ci
      LEFT JOIN companies co ON co.id = ci.company_id
      LEFT JOIN business_names bn ON bn.id = ci.business_name_id
      WHERE ci.completed_on IS NULL AND ci.due_date <= ?
      ORDER BY ci.due_date LIMIT 12`, addDays(t, 45)),
    all<Task & { co_name: string | null; co_type: string | null; co_j: string | null }>(db, `
      SELECT t.*, co.legal_name AS co_name, co.name_type AS co_type, co.jurisdiction AS co_j FROM tasks t
      LEFT JOIN companies co ON co.id = t.company_id
      WHERE t.done_at IS NULL AND (t.assignee_id = ? OR t.assignee_id IS NULL)
      ORDER BY t.due_date IS NULL, t.due_date, t.created_at LIMIT 10`, user.id),
    all<{ message: string; created_at: string; user_name: string | null; company_id: string | null }>(db, `
      SELECT a.message, a.created_at, u.name AS user_name, a.company_id FROM activity a
      LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT 10`),
  ]);
  const n = Object.fromEntries(counts.map((r) => [r.k, r.n]));
  const coName = (r: { co_name: string | null; co_type: string | null; co_j: string | null }) =>
    displayName({ legal_name: r.co_name, name_type: (r.co_type ?? 'named') as Company['name_type'], jurisdiction: r.co_j ?? '', distinctive: null, descriptive: null, legal_ending: null, corp_number: null });

  return Page(c, {
    title: `Good ${Number(new Date().toLocaleString('en-CA', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Toronto' })) < 12 ? 'morning' : 'afternoon'}, ${user.name.split(' ')[0]}`,
    sub: <p class="muted">Here's what needs attention across the practice.</p>,
    actions: (
      <>
        <a class="btn" href="/clients/new">New client</a>
        <a class="btn primary" href="/companies/new">Start incorporation</a>
      </>
    ),
    children: (
      <>
        <div class="grid g4" style="margin-bottom:16px">
          <a class="card stat" href="/companies" style="text-decoration:none;color:inherit"><div class="n">{n.companies ?? 0}</div><div class="l">Companies under management</div></a>
          <a class="card stat" href="/companies?status=in_progress" style="text-decoration:none;color:inherit"><div class="n">{n.in_progress ?? 0}</div><div class="l">Incorporations in progress</div></a>
          <a class="card stat" href="/compliance?view=overdue" style="text-decoration:none;color:inherit"><div class="n" style={n.overdue ? 'color:var(--bad)' : ''}>{n.overdue ?? 0}</div><div class="l">Overdue filings</div></a>
          <a class="card stat" href="/compliance" style="text-decoration:none;color:inherit"><div class="n">{n.due30 ?? 0}</div><div class="l">Due in the next 30 days</div></a>
        </div>
        <div class="grid g2">
          <div class="card flush">
            <h2>Upcoming compliance</h2>
            {due.length ? (
              <table>
                <tbody>
                  {due.map((d) => (
                    <tr>
                      <td>
                        <div>{d.title}</div>
                        <div class="small muted">
                          {d.company_id ? <a href={`/companies/${d.company_id}?tab=compliance`}>{coName(d)}</a> : <a href={`/business-names/${d.business_name_id}`}>{d.bn_name}</a>}
                        </div>
                      </td>
                      <td class="num"><D d={d.due_date} /><br /><DueBadge item={d} today={t} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>Nothing due in the next 45 days.</Empty>}
          </div>
          <div class="card flush">
            <h2>Incorporation pipeline</h2>
            <div style="padding:0 20px 8px" class="row small muted">
              {STATUSES.slice(0, 4).map((st) => <span><span class="badge">{pipeline.filter((p) => p.status === st.code).length}</span> {st.label}</span>)}
            </div>
            {pipeline.length ? (
              <table>
                <tbody>
                  {pipeline.map((p) => (
                    <tr>
                      <td><a href={`/companies/${p.id}`}>{displayName(p)}</a><div class="small muted">{p.jurisdiction}</div></td>
                      <td class="num"><StatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>No incorporations in progress. <a href="/companies/new">Start one</a>.</Empty>}
          </div>
          <div class="card flush">
            <h2>My open tasks</h2>
            {myTasks.length ? (
              <table>
                <tbody>
                  {myTasks.map((tk) => (
                    <tr>
                      <td>{tk.title}{tk.company_id ? <div class="small muted"><a href={`/companies/${tk.company_id}?tab=tasks`}>{coName(tk)}</a></div> : null}</td>
                      <td class="num">{tk.due_date ? <D d={tk.due_date} /> : <span class="muted small">No date</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty>You're all caught up.</Empty>}
          </div>
          <div class="card flush">
            <h2>Recent activity</h2>
            {recent.length ? (
              <ul class="list-plain" style="padding:0 20px">
                {recent.map((a) => (
                  <li>
                    <div>{a.company_id ? <a href={`/companies/${a.company_id}`}>{a.message}</a> : a.message}</div>
                    <div class="small muted">{a.user_name ?? 'System'} · {a.created_at.slice(0, 16).replace('T', ' ')} UTC</div>
                  </li>
                ))}
              </ul>
            ) : <Empty>No activity yet.</Empty>}
          </div>
        </div>
      </>
    ),
  });
});

export default app;
