import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, newId, run, stmt } from '../lib/db.ts';
import { hashPassword, passwordProblem, verifyPassword } from '../lib/auth.ts';
import { jurisdictionList } from '../lib/jurisdictions.ts';
import { loadDemoData } from '../lib/demo.ts';
import type { User } from '../lib/types.ts';
import { readForm, redirect, s } from '../http.ts';
import { Field, Page, Post, Select } from '../views/layout.tsx';

const app = new Hono<AppEnv>();

// Any signed-in user can change their own password.
app.post('/password', async (c) => {
  const f = await readForm(c);
  const me = await first<User>(c.env.DB, 'SELECT * FROM users WHERE id = ?', c.get('user').id);
  if (!me || !(await verifyPassword(s(f.current), me.password_hash!))) return redirect(c, '/team/account', 'error', 'Current password is incorrect.');
  const problem = passwordProblem(s(f.password));
  if (problem) return redirect(c, '/team/account', 'error', problem);
  await run(c.env.DB, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(s(f.password)), me.id);
  return redirect(c, '/team/account', 'ok', 'Password changed.');
});
app.get('/account', (c) =>
  Page(c, {
    title: 'My account',
    children: (
      <form method="post" action="/team/password" class="card stack" style="max-width:480px">
        <h2>Change password</h2>
        <Field label="Current password" name="current" type="password" required />
        <Field label="New password" name="password" type="password" required hint="10+ characters" />
        <button class="btn primary">Change password</button>
      </form>
    ),
  }),
);

// Everything else is admin-only.
app.use('*', async (c, next) => {
  if (c.get('user').role !== 'admin') return redirect(c, '/', 'error', 'Administrators only.');
  await next();
});

app.get('/', async (c) => {
  const users = await all<User>(c.env.DB, 'SELECT id, email, name, role, active, created_at FROM users ORDER BY active DESC, name');
  const n = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM companies');
  const me = c.get('user');
  return Page(c, {
    title: 'Team & settings',
    actions: <a class="btn" href="/team/account">My account</a>,
    children: (
      <div class="grid g2">
        <div class="card flush">
          <h2>Team members</h2>
          <table>
            <tbody>
              {users.map((u) => (
                <tr class={u.active ? '' : 'done'}>
                  <td><span class="t">{u.name}</span><div class="small muted">{u.email}</div></td>
                  <td><span class={`badge ${u.role === 'admin' ? 'b-brand' : ''}`}>{u.role}</span></td>
                  <td class="num">
                    {u.id !== me.id ? (
                      <>
                        <Post action={`/team/${u.id}/toggle`}><button class="btn sm link">{u.active ? 'Deactivate' : 'Reactivate'}</button></Post>
                        {' · '}
                        <details class="inline" style="display:inline-block;text-align:left"><summary class="small">Reset password</summary>
                          <Post action={`/team/${u.id}/password`} inline={false}><input name="password" type="password" placeholder="New password" required minlength={10} /><button class="btn sm" style="margin-top:6px">Set</button></Post>
                        </details>
                      </>
                    ) : <span class="small muted">You</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form method="post" action="/team" class="stack" style="padding:16px 20px;border-top:1px solid var(--line)">
            <h3>Add a team member</h3>
            <div class="fields">
              <Field label="Name" name="name" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Temporary password" name="password" type="password" required hint="10+ characters" />
              <Select label="Role" name="role" value="staff" options={[['staff', 'Staff'], ['admin', 'Admin']]} />
            </div>
            <button class="btn primary sm">Add member</button>
          </form>
        </div>
        <div>
          <div class="card">
            <h2>Jurisdiction rules</h2>
            <p class="small muted">Used for name checks and the compliance calendar. These are operational defaults; confirm against each registry and edit <span class="mono">src/lib/jurisdictions.ts</span> when rules change.</p>
            <table>
              <thead><tr><th>Jurisdiction</th><th>Annual filing</th><th>Resident directors</th></tr></thead>
              <tbody>{jurisdictionList().map((j) => <tr><td>{j.longName}<div class="small muted">{j.registry}</div></td><td class="small">{j.annualReturn.rule === 'days' ? `${j.annualReturn.amount} days after anniversary` : j.annualReturn.rule === 'months' ? `${j.annualReturn.amount} months after anniversary` : 'End of month after anniversary month'}</td><td>{j.residentDirectorPct ? `${j.residentDirectorPct}%` : 'None'}</td></tr>)}</tbody>
            </table>
          </div>
          {!n?.n ? (
            <div class="card">
              <h2>Demo data</h2>
              <p class="small muted">Load sample clients and companies to explore the app. Only available while there are no companies.</p>
              <Post action="/team/demo"><button class="btn">Load demo data</button></Post>
            </div>
          ) : null}
        </div>
      </div>
    ),
  });
});

app.post('/', async (c) => {
  const f = await readForm(c);
  const problem = passwordProblem(s(f.password)) ?? (!s(f.name) || !s(f.email) ? 'Name and email are required.' : null);
  if (problem) return redirect(c, '/team', 'error', problem);
  if (await first(c.env.DB, 'SELECT id FROM users WHERE email = ?', s(f.email).toLowerCase())) return redirect(c, '/team', 'error', 'A user with that email already exists.');
  await run(c.env.DB, 'INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?,?)', newId(), s(f.email).toLowerCase(), s(f.name), await hashPassword(s(f.password)), s(f.role) === 'admin' ? 'admin' : 'staff');
  return redirect(c, '/team', 'ok', `${s(f.name)} can now sign in. Share the temporary password securely and ask them to change it.`);
});
app.post('/:id/toggle', async (c) => {
  if (c.req.param('id') === c.get('user').id) return redirect(c, '/team', 'error', "You can't deactivate yourself.");
  await batch(c.env.DB, [stmt(c.env.DB, 'UPDATE users SET active = 1 - active WHERE id = ?', c.req.param('id'))]);
  return redirect(c, '/team', 'ok', 'Updated.');
});
app.post('/:id/password', async (c) => {
  const f = await readForm(c);
  const problem = passwordProblem(s(f.password));
  if (problem) return redirect(c, '/team', 'error', problem);
  await run(c.env.DB, 'UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(s(f.password)), c.req.param('id'));
  return redirect(c, '/team', 'ok', 'Password reset.');
});
app.post('/demo', async (c) => {
  const n = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM companies');
  if (n?.n) return redirect(c, '/team', 'error', 'Demo data can only be loaded into an empty workspace.');
  await loadDemoData(c.env.DB, c.get('user').id);
  return redirect(c, '/', 'ok', 'Demo data loaded.');
});

export default app;
