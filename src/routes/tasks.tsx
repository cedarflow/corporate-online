import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, newId, stmt } from '../lib/db.ts';
import { isIso, today } from '../lib/dates.ts';
import { displayName } from '../lib/company.ts';
import type { Company, Task, User } from '../lib/types.ts';
import { readForm, redirect, safeBack, s } from '../http.ts';
import { D, Empty, Page, Post } from '../views/layout.tsx';

const app = new Hono<AppEnv>();

app.get('/', async (c) => {
  const user = c.get('user');
  const who = c.req.query('who') === 'all' ? 'all' : 'mine';
  const rows = await all<Task & { assignee_name: string | null; co_name: string | null; co_type: string | null; co_j: string | null }>(c.env.DB, `
    SELECT t.*, u.name AS assignee_name, co.legal_name AS co_name, co.name_type AS co_type, co.jurisdiction AS co_j
    FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN companies co ON co.id = t.company_id
    WHERE t.done_at IS NULL ${who === 'mine' ? 'AND (t.assignee_id = ? OR t.assignee_id IS NULL)' : ''}
    ORDER BY t.due_date IS NULL, t.due_date, co.legal_name, t.sort LIMIT 1000`, ...(who === 'mine' ? [user.id] : []));
  const users = await all<User>(c.env.DB, 'SELECT id, name FROM users WHERE active = 1 ORDER BY name');
  const t = today();
  const back = `/tasks?who=${who}`;
  return Page(c, {
    title: 'Tasks',
    children: (
      <>
        <nav class="tabs"><a href="/tasks?who=mine" class={who === 'mine' ? 'on' : ''}>Mine & unassigned</a><a href="/tasks?who=all" class={who === 'all' ? 'on' : ''}>Everyone</a></nav>
        <div class="card flush">
          {rows.length ? (
            <table>
              <thead><tr><th></th><th>Task</th><th>Company</th><th>Assignee</th><th>Due</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr>
                    <td style="width:40px"><Post action={`/tasks/${r.id}/toggle`}><input type="hidden" name="back" value={back} /><button class="btn sm" title="Mark done">○</button></Post></td>
                    <td>{r.title}</td>
                    <td>{r.company_id ? <a href={`/companies/${r.company_id}?tab=tasks`}>{displayName({ legal_name: r.co_name, name_type: (r.co_type ?? 'named') as Company['name_type'], jurisdiction: r.co_j ?? '', distinctive: null, descriptive: null, legal_ending: null, corp_number: null })}</a> : <span class="muted">—</span>}</td>
                    <td>
                      <Post action={`/tasks/${r.id}/assign`}>
                        <input type="hidden" name="back" value={back} />
                        <select name="assignee_id" style="width:auto" data-autosubmit>
                          <option value="">Unassigned</option>
                          {users.map((u) => <option value={u.id} selected={u.id === r.assignee_id}>{u.name}</option>)}
                        </select>
                        <noscript><button class="btn sm">Set</button></noscript>
                      </Post>
                    </td>
                    <td>{r.due_date ? <span style={r.due_date < t ? 'color:var(--bad);font-weight:600' : ''}><D d={r.due_date} /></span> : <span class="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No open tasks.</Empty>}
          <form method="post" action="/tasks" style="padding:16px 20px;border-top:1px solid var(--line)" class="row">
            <input type="hidden" name="back" value={back} />
            <input name="title" placeholder="Add a general task…" required style="flex:2;min-width:200px" />
            <input name="due_date" type="date" style="flex:1;min-width:140px" />
            <select name="assignee_id" style="flex:1;min-width:140px"><option value="">Unassigned</option>{users.map((u) => <option value={u.id} selected={u.id === user.id}>{u.name}</option>)}</select>
            <button class="btn primary">Add</button>
          </form>
        </div>
      </>
    ),
  });
});

app.post('/', async (c) => {
  const f = await readForm(c);
  const back = safeBack(f.back, '/tasks');
  if (!s(f.title)) return redirect(c, back, 'error', 'Task title is required.');
  const companyId = s(f.company_id) || null;
  if (companyId && !(await first(c.env.DB, 'SELECT id FROM companies WHERE id = ?', companyId))) return c.notFound();
  const n = companyId ? await first<{ n: number }>(c.env.DB, 'SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM tasks WHERE company_id = ?', companyId) : null;
  await batch(c.env.DB, [stmt(c.env.DB, 'INSERT INTO tasks (id, company_id, title, due_date, assignee_id, sort, created_by) VALUES (?,?,?,?,?,?,?)', newId(), companyId, s(f.title), isIso(s(f.due_date)) ? s(f.due_date) : null, s(f.assignee_id), n?.n ?? 0, c.get('user').id)]);
  return redirect(c, back, 'ok', 'Task added.');
});
app.post('/:id/toggle', async (c) => {
  const f = await readForm(c);
  await batch(c.env.DB, [stmt(c.env.DB, "UPDATE tasks SET done_at = CASE WHEN done_at IS NULL THEN datetime('now') ELSE NULL END WHERE id = ?", c.req.param('id'))]);
  return redirect(c, safeBack(f.back, '/tasks'));
});
app.post('/:id/assign', async (c) => {
  const f = await readForm(c);
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE tasks SET assignee_id = ? WHERE id = ?', s(f.assignee_id), c.req.param('id'))]);
  return redirect(c, safeBack(f.back, '/tasks'));
});
app.post('/:id/delete', async (c) => {
  const f = await readForm(c);
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM tasks WHERE id = ?', c.req.param('id'))]);
  return redirect(c, safeBack(f.back, '/tasks'), 'ok', 'Task deleted.');
});

export default app;
