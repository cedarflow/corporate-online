import { Hono } from 'hono';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { deleteCookie, getCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import type { AppEnv, Ctx } from './env.ts';
import { CSS, JS } from './views/styles.ts';
import { Shell, Field } from './views/layout.tsx';
import { first, newId, run } from './lib/db.ts';
import { hashPassword, passwordProblem, verifyPassword } from './lib/auth.ts';
import { today } from './lib/dates.ts';
import type { User } from './lib/types.ts';
import { readForm, redirect, s, safeBack } from './http.ts';
import dashboard from './routes/dashboard.tsx';
import companies from './routes/companies.tsx';
import records from './routes/records.tsx';
import resolutions from './routes/resolutions.tsx';
import documents from './routes/documents.tsx';
import extras from './routes/extras.tsx';
import clients from './routes/clients.tsx';
import businessNames from './routes/businessNames.tsx';
import compliance from './routes/compliance.tsx';
import tasks from './routes/tasks.tsx';
import team from './routes/team.tsx';

const SESSION_DAYS = 14;
const app = new Hono<AppEnv>();

app.use(secureHeaders({ contentSecurityPolicy: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], formAction: ["'self'"], frameAncestors: ["'none'"] } }));
app.use(csrf());

app.get('/static/app.css', (c) => c.body(CSS, 200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=300' }));
app.get('/static/app.js', (c) => c.body(JS, 200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' }));
app.get('/healthz', (c) => c.text('ok'));

function secret(c: Ctx): string {
  const sec = c.env.SESSION_SECRET;
  if (!sec || sec.length < 16) throw new Error('SESSION_SECRET is not configured (set it with `wrangler secret put SESSION_SECRET`, or in .dev.vars locally).');
  return sec;
}
const isHttps = (c: Ctx) => new URL(c.req.url).protocol === 'https:';

async function startSession(c: Ctx, userId: string) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  await setSignedCookie(c, 'sid', `${userId}.${exp}`, secret(c), { path: '/', httpOnly: true, sameSite: 'Lax', secure: isHttps(c), maxAge: SESSION_DAYS * 86400 });
}

const AuthPage = (props: { title: string; children: any; error?: string }) => (
  <Shell title={props.title}>
    <div class="auth">
      <div class="row" style="margin-bottom:18px"><span class="badge b-brand">Corporate Online</span><span class="muted small">Internal</span></div>
      <div class="card">
        <h1 style="margin-bottom:12px">{props.title}</h1>
        {props.error ? <div class="flash error">{props.error}</div> : null}
        {props.children}
      </div>
    </div>
  </Shell>
);

// ---- First-run setup: create the first admin account ----
// If SETUP_TOKEN is configured, setup only works via /setup?token=<SETUP_TOKEN>.
function setupAllowed(c: Ctx, token: string | undefined): boolean {
  const expected = c.env.SETUP_TOKEN;
  if (!expected) return true;
  if (!token || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
const SetupLocked = () => <AuthPage title="Setup link required"><p class="muted">This workspace hasn't been set up yet. Open the setup link you were given (it includes a token).</p></AuthPage>;

app.get('/setup', async (c) => {
  const n = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM users');
  if (n && n.n > 0) return c.redirect('/login');
  if (!setupAllowed(c, c.req.query('token'))) return c.html(<SetupLocked />, 403);
  return c.html(
    <AuthPage title="Set up Corporate Online">
      <p class="muted">Create the first administrator account. You can invite the rest of the team afterwards.</p>
      <form method="post" class="stack">
        <input type="hidden" name="token" value={c.req.query('token') ?? ''} />
        <Field label="Your name" name="name" required />
        <Field label="Work email" name="email" type="email" required />
        <Field label="Password" name="password" type="password" required hint="10+ characters" />
        <button class="btn primary">Create admin account</button>
      </form>
    </AuthPage>,
  );
});
app.post('/setup', async (c) => {
  const n = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM users');
  if (n && n.n > 0) return c.redirect('/login');
  const f = await readForm(c);
  if (!setupAllowed(c, s(f.token))) return c.html(<SetupLocked />, 403);
  const problem = passwordProblem(s(f.password)) ?? (!s(f.name) || !s(f.email) ? 'Name and email are required.' : null);
  if (problem) return c.html(<AuthPage title="Set up Corporate Online" error={problem}><p><a href={`/setup?token=${encodeURIComponent(s(f.token))}`}>Try again</a></p></AuthPage>, 400);
  const id = newId();
  await run(c.env.DB, "INSERT INTO users (id, email, name, password_hash, role) VALUES (?,?,?,?, 'admin')", id, s(f.email).toLowerCase(), s(f.name), await hashPassword(s(f.password)));
  await startSession(c, id);
  return c.redirect('/', 303);
});

// ---- Login / logout ----
const LoginForm = ({ error, next, email }: { error?: string; next?: string; email?: string }) => (
  <AuthPage title="Sign in" error={error}>
    <form method="post" action="/login" class="stack">
      <input type="hidden" name="next" value={next ?? '/'} />
      <Field label="Email" name="email" type="email" value={email} required attrs={{ autocomplete: 'username', autofocus: '' }} />
      <Field label="Password" name="password" type="password" required attrs={{ autocomplete: 'current-password' }} />
      <button class="btn primary">Sign in</button>
    </form>
  </AuthPage>
);
app.get('/login', async (c) => {
  const n = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM users');
  if (!n || n.n === 0) return c.env.SETUP_TOKEN ? c.html(<SetupLocked />, 403) : c.redirect('/setup');
  return c.html(<LoginForm next={c.req.query('next')} />);
});
app.post('/login', async (c) => {
  const f = await readForm(c);
  const user = await first<User>(c.env.DB, 'SELECT * FROM users WHERE email = ? AND active = 1', s(f.email).toLowerCase());
  const ok = user ? await verifyPassword(s(f.password), user.password_hash!) : await hashPassword('timing-equaliser').then(() => false);
  if (!user || !ok) return c.html(<LoginForm error="Email or password is incorrect." next={s(f.next)} email={s(f.email)} />, 401);
  await startSession(c, user.id);
  return c.redirect(safeBack(f.next, '/'), 303);
});
app.post('/logout', (c) => {
  deleteCookie(c, 'sid', { path: '/', secure: isHttps(c) });
  return c.redirect('/login', 303);
});

// ---- Everything below requires a signed-in user ----
app.use('*', async (c, next) => {
  const raw = await getSignedCookie(c, secret(c), 'sid');
  const [uid, exp] = typeof raw === 'string' ? raw.split('.') : [];
  const user = uid && Number(exp) > Date.now() ? await first<User>(c.env.DB, 'SELECT id, email, name, role, active FROM users WHERE id = ? AND active = 1', uid) : null;
  if (!user) {
    const url = new URL(c.req.url);
    return c.redirect(`/login?next=${encodeURIComponent(url.pathname + url.search)}`);
  }
  c.set('user', user);
  const flash = getCookie(c, 'flash');
  if (flash) {
    deleteCookie(c, 'flash', { path: '/' });
    try { c.set('flash', JSON.parse(flash)); } catch { c.set('flash', null); }
  } else c.set('flash', null);
  const o = await first<{ n: number }>(c.env.DB, 'SELECT COUNT(*) AS n FROM compliance_items WHERE completed_on IS NULL AND due_date < ?', today());
  c.set('overdue', o?.n ?? 0);
  await next();
});

app.route('/', dashboard);
app.route('/companies', companies);
app.route('/companies', records);
app.route('/companies', resolutions);
app.route('/companies', documents);
app.route('/companies', extras);
app.route('/clients', clients);
app.route('/business-names', businessNames);
app.route('/compliance', compliance);
app.route('/tasks', tasks);
app.route('/team', team);

app.notFound((c) => c.html(<Shell title="Not found"><div class="auth"><div class="card"><h1>Not found</h1><p class="muted">That page doesn't exist.</p><a class="btn" href="/">Back to dashboard</a></div></div></Shell>, 404));
app.onError((err, c) => {
  console.error(err);
  return c.html(<Shell title="Error"><div class="auth"><div class="card"><h1>Something went wrong</h1><p class="muted">{err.message}</p><a class="btn" href="/">Back to dashboard</a></div></div></Shell>, 500);
});

export default app;
