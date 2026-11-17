// Shared bookmarks ("Useful links") shown on the dashboard.
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { batch, newId, stmt } from '../lib/db.ts';
import { readForm, redirect, s } from '../http.ts';

const app = new Hono<AppEnv>();

/** Accept only absolute http(s) URLs. Returns the normalised URL or null. */
export function cleanUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

app.post('/', async (c) => {
  const f = await readForm(c);
  const url = cleanUrl(s(f.url));
  if (!url) return redirect(c, '/', 'error', 'Enter a full web address starting with https://');
  const title = s(f.title) || new URL(url).hostname;
  await batch(c.env.DB, [stmt(c.env.DB, 'INSERT INTO links (id, title, url, notes, created_by) VALUES (?,?,?,?,?)', newId(), title, url, s(f.notes), c.get('user').id)]);
  return redirect(c, '/', 'ok', `Saved link "${title}".`);
});

app.post('/:id/delete', async (c) => {
  await batch(c.env.DB, [stmt(c.env.DB, 'DELETE FROM links WHERE id = ?', c.req.param('id'))]);
  return redirect(c, '/', 'ok', 'Link removed.');
});

export default app;
