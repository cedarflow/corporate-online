import type { Child, FC } from 'hono/jsx';
import { raw } from 'hono/html';
import type { Ctx } from '../env.ts';
import { short } from '../lib/dates.ts';
import { itemState, type ItemState } from '../lib/compliance.ts';
import { statusLabel } from '../lib/statuses.ts';

const NAV: [string, string][] = [
  ['/', 'Dashboard'],
  ['/companies', 'Companies'],
  ['/clients', 'Clients'],
  ['/business-names', 'Business names'],
  ['/compliance', 'Compliance'],
  ['/tasks', 'Tasks'],
];

export function Page(c: Ctx, props: { title: string; children: Child; crumbs?: [string, string?][]; actions?: Child; sub?: Child }) {
  const user = c.get('user');
  const path = new URL(c.req.url).pathname;
  const flash = c.get('flash');
  const overdue = c.get('overdue');
  const on = (href: string) => (href === '/' ? path === '/' : path.startsWith(href));
  return c.html(
    <Shell title={props.title}>
      <div class="app">
        <aside class="side">
          <a class="brand" href="/"><span class="logo">C</span><span>Corporate Online</span></a>
          <nav class="nav">
            {NAV.map(([href, label]) => (
              <a href={href} class={on(href) ? 'on' : ''}>
                {label}
                {href === '/compliance' && overdue > 0 ? <span class="count" title="Overdue items">{overdue}</span> : null}
              </a>
            ))}
            {user.role === 'admin' ? <a href="/team" class={on('/team') ? 'on' : ''}>Team & settings</a> : null}
          </nav>
          <div class="me">
            <div><strong>{user.name}</strong></div>
            <div class="small" style="color:var(--side-muted)">{user.email}</div>
            <form method="post" action="/logout" style="margin-top:6px"><button>Sign out</button></form>
          </div>
        </aside>
        <main>
          <div class="head">
            <div>
              {props.crumbs ? (
                <div class="crumbs">
                  {props.crumbs.map(([label, href], i) => (
                    <>
                      {i > 0 ? ' / ' : ''}
                      {href ? <a href={href}>{label}</a> : label}
                    </>
                  ))}
                </div>
              ) : null}
              <h1>{props.title}</h1>
              {props.sub}
            </div>
            <div class="row">{props.actions}</div>
          </div>
          {flash ? <div class={`flash ${flash.kind}`}>{flash.msg}</div> : null}
          {props.children}
        </main>
      </div>
    </Shell>,
  );
}

export const Shell: FC<{ title: string; children: Child }> = ({ title, children }) => (
  <>
    {raw('<!doctype html>')}
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title} · Corporate Online</title>
        <link rel="stylesheet" href="/static/app.css" />
      </head>
      <body>
        {children}
        <script src="/static/app.js" defer></script>
      </body>
    </html>
  </>
);

export const StatusBadge: FC<{ status: string }> = ({ status }) => {
  const cls = { draft: '', name_review: 'b-info', ready_to_file: 'b-warn', filed: 'b-info', active: 'b-ok', dissolved: '' }[status] ?? '';
  return <span class={`badge ${cls}`}>{statusLabel(status)}</span>;
};

const STATE: Record<ItemState, [string, string]> = {
  done: ['b-ok', 'Done'],
  overdue: ['b-bad', 'Overdue'],
  due_soon: ['b-warn', 'Due soon'],
  upcoming: ['', 'Upcoming'],
};
export const DueBadge: FC<{ item: { due_date: string; completed_on: string | null }; today: string }> = ({ item, today }) => {
  const [cls, label] = STATE[itemState(item, today)];
  return <span class={`badge ${cls}`}>{label}</span>;
};

export const D: FC<{ d?: string | null }> = ({ d }) => <span style="white-space:nowrap">{d ? short(d) : '—'}</span>;

export const Empty: FC<{ children: Child }> = ({ children }) => <div class="empty">{children}</div>;

export const Field: FC<{ label: string; name: string; value?: string | number | null; type?: string; required?: boolean; hint?: string; placeholder?: string; attrs?: Record<string, string> }> = (p) => (
  <div>
    <label for={p.name}>
      {p.label} {p.hint ? <span class="hint">({p.hint})</span> : null}
    </label>
    <input id={p.name} name={p.name} type={p.type ?? 'text'} value={p.value ?? ''} required={p.required} placeholder={p.placeholder} {...(p.attrs ?? {})} />
  </div>
);

export const Area: FC<{ label: string; name: string; value?: string | null; hint?: string; rows?: number }> = (p) => (
  <div>
    <label for={p.name}>
      {p.label} {p.hint ? <span class="hint">({p.hint})</span> : null}
    </label>
    <textarea id={p.name} name={p.name} rows={p.rows ?? 3}>{p.value ?? ''}</textarea>
  </div>
);

export const Select: FC<{ label: string; name: string; value?: string | null; options: [string, string][]; blank?: string; required?: boolean }> = (p) => (
  <div>
    <label for={p.name}>{p.label}</label>
    <select id={p.name} name={p.name} required={p.required}>
      {p.blank !== undefined ? <option value="">{p.blank}</option> : null}
      {p.options.map(([v, l]) => (
        <option value={v} selected={v === (p.value ?? '')}>{l}</option>
      ))}
    </select>
  </div>
);

export const Post: FC<{ action: string; children: Child; confirm?: string; inline?: boolean }> = (p) => (
  <form method="post" action={p.action} data-confirm={p.confirm} style={p.inline === false ? '' : 'display:inline'}>
    {p.children}
  </form>
);
