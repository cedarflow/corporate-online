// Minute-book record mutations: directors, officers, share classes, shareholders, share ledger.
import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { all, batch, first, logStmt, newId, stmt } from '../lib/db.ts';
import { isIso, today } from '../lib/dates.ts';
import { validateTx } from '../lib/captable.ts';
import { displayName } from '../lib/company.ts';
import type { Company, ShareClass, ShareTx } from '../lib/types.ts';
import { int, readForm, redirect, s } from '../http.ts';

const app = new Hono<AppEnv>();

async function company(db: D1Database, id: string) {
  return await first<Company>(db, 'SELECT * FROM companies WHERE id = ?', id);
}
const touch = (db: D1Database, id: string) => stmt(db, "UPDATE companies SET updated_at = datetime('now') WHERE id = ?", id);

// ---- Directors
app.post('/:id/directors', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  const appointed = isIso(s(f.appointed_on)) ? s(f.appointed_on) : co.incorporation_date ? today() : null;
  if (!s(f.name)) return redirect(c, `/companies/${co.id}?tab=people`, 'error', 'Name is required.');
  await batch(db, [
    stmt(db, 'INSERT INTO directors (id, company_id, name, email, address, resident_canadian, appointed_on) VALUES (?,?,?,?,?,?,?)', newId(), co.id, s(f.name), s(f.email), s(f.address), s(f.resident_canadian) !== '0', appointed),
    touch(db, co.id),
    logStmt(db, c.get('user').id, `${displayName(co)}: ${s(f.name)} appointed director`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=people`, 'ok', 'Director added. Remember to file a notice of change with the registry if required.');
});
app.post('/:id/directors/:did/cease', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!isIso(s(f.date))) return redirect(c, `/companies/${co.id}?tab=people`, 'error', 'Enter a valid date.');
  const d = await first<{ name: string }>(db, 'SELECT name FROM directors WHERE id = ? AND company_id = ?', c.req.param('did'), co.id);
  if (!d) return c.notFound();
  await batch(db, [
    stmt(db, 'UPDATE directors SET ceased_on = ? WHERE id = ? AND company_id = ?', s(f.date), c.req.param('did'), co.id),
    touch(db, co.id),
    logStmt(db, c.get('user').id, `${displayName(co)}: ${d.name} ceased to be a director`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=people`, 'ok', 'Director record updated.');
});
app.post('/:id/directors/:did/delete', async (c) => {
  const db = c.env.DB;
  await batch(db, [stmt(db, 'DELETE FROM directors WHERE id = ? AND company_id = ?', c.req.param('did'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'ok', 'Director record deleted.');
});

// ---- Officers
app.post('/:id/officers', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.name) || !s(f.title)) return redirect(c, `/companies/${co.id}?tab=people`, 'error', 'Name and office are required.');
  await batch(db, [
    stmt(db, 'INSERT INTO officers (id, company_id, name, title, appointed_on) VALUES (?,?,?,?,?)', newId(), co.id, s(f.name), s(f.title), isIso(s(f.appointed_on)) ? s(f.appointed_on) : co.incorporation_date ? today() : null),
    touch(db, co.id),
    logStmt(db, c.get('user').id, `${displayName(co)}: ${s(f.name)} appointed ${s(f.title)}`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=people`, 'ok', 'Officer appointed.');
});
app.post('/:id/officers/:oid/cease', async (c) => {
  const db = c.env.DB;
  const f = await readForm(c);
  if (!isIso(s(f.date))) return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'error', 'Enter a valid date.');
  await batch(db, [stmt(db, 'UPDATE officers SET ceased_on = ? WHERE id = ? AND company_id = ?', s(f.date), c.req.param('oid'), c.req.param('id')), touch(db, c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=people`, 'ok', 'Officer record updated.');
});

// ---- Share classes
app.post('/:id/share-classes', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.name)) return redirect(c, `/companies/${co.id}?tab=shares`, 'error', 'Class name is required.');
  const exists = await first(db, 'SELECT id FROM share_classes WHERE company_id = ? AND name = ?', co.id, s(f.name));
  if (exists) return redirect(c, `/companies/${co.id}?tab=shares`, 'error', 'A class with that name already exists.');
  const max = int(f.max_shares);
  const n = await first<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM share_classes WHERE company_id = ?', co.id);
  await batch(db, [
    stmt(db, 'INSERT INTO share_classes (id, company_id, name, voting, participating, max_shares, rights, sort) VALUES (?,?,?,?,?,?,?,?)', newId(), co.id, s(f.name), s(f.voting) === '1', s(f.participating) === '1', max && max > 0 ? Math.floor(max) : null, s(f.rights), n?.n ?? 0),
    touch(db, co.id),
    logStmt(db, c.get('user').id, `${displayName(co)}: added share class ${s(f.name)}`, { companyId: co.id }),
  ]);
  return redirect(c, `/companies/${co.id}?tab=shares`, 'ok', 'Share class added.');
});

// ---- Shareholders
app.post('/:id/shareholders', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const f = await readForm(c);
  if (!s(f.name)) return redirect(c, `/companies/${co.id}?tab=shares`, 'error', 'Name is required.');
  const kind = ['individual', 'corporation', 'trust'].includes(s(f.kind)) ? s(f.kind) : 'individual';
  await batch(db, [
    stmt(db, 'INSERT INTO shareholders (id, company_id, name, kind, email, address) VALUES (?,?,?,?,?,?)', newId(), co.id, s(f.name), kind, s(f.email), s(f.address)),
    touch(db, co.id),
  ]);
  return redirect(c, `/companies/${co.id}?tab=shares`, 'ok', 'Shareholder added. Record an issuance or transfer to give them shares.');
});
app.post('/:id/shareholders/:sid/delete', async (c) => {
  const db = c.env.DB;
  const used = await first(db, 'SELECT id FROM share_transactions WHERE company_id = ? AND (from_shareholder_id = ? OR to_shareholder_id = ?) LIMIT 1', c.req.param('id'), c.req.param('sid'), c.req.param('sid'));
  if (used) return redirect(c, `/companies/${c.req.param('id')}?tab=shares`, 'error', 'This shareholder appears in the share ledger and cannot be removed.');
  await batch(db, [stmt(db, 'DELETE FROM shareholders WHERE id = ? AND company_id = ?', c.req.param('sid'), c.req.param('id'))]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=shares`, 'ok', 'Shareholder removed.');
});

// ---- Share ledger
app.post('/:id/transactions', async (c) => {
  const db = c.env.DB;
  const co = await company(db, c.req.param('id'));
  if (!co) return c.notFound();
  const back = `/companies/${co.id}?tab=shares`;
  const f = await readForm(c);
  const kind = s(f.kind) as ShareTx['kind'];
  if (!['issuance', 'transfer', 'redemption'].includes(kind)) return redirect(c, back, 'error', 'Unknown transaction type.');
  if (!isIso(s(f.tx_date))) return redirect(c, back, 'error', 'Enter a valid date.');
  const [classes, existing, holders] = await Promise.all([
    all<ShareClass>(db, 'SELECT * FROM share_classes WHERE company_id = ?', co.id),
    all<ShareTx>(db, 'SELECT * FROM share_transactions WHERE company_id = ? ORDER BY tx_date, created_at', co.id),
    all<{ id: string; name: string }>(db, 'SELECT id, name FROM shareholders WHERE company_id = ?', co.id),
  ]);
  const ids = new Set(holders.map((h) => h.id));
  const tx = {
    kind,
    share_class_id: s(f.share_class_id),
    from_shareholder_id: kind === 'issuance' ? null : s(f.from_shareholder_id) || null,
    to_shareholder_id: kind === 'redemption' ? null : s(f.to_shareholder_id) || null,
    quantity: Number(s(f.quantity)),
  };
  if ((tx.from_shareholder_id && !ids.has(tx.from_shareholder_id)) || (tx.to_shareholder_id && !ids.has(tx.to_shareholder_id))) return redirect(c, back, 'error', 'Unknown shareholder.');
  // Validate against holdings as of the transaction date.
  const prior = existing.filter((t) => t.tx_date <= s(f.tx_date));
  const err = validateTx(prior, tx, classes.find((cl) => cl.id === tx.share_class_id));
  if (err) return redirect(c, back, 'error', err);
  const name = (id: string | null) => holders.find((h) => h.id === id)?.name ?? '';
  const desc = kind === 'issuance' ? `issued ${tx.quantity} shares to ${name(tx.to_shareholder_id)}` : kind === 'transfer' ? `transfer of ${tx.quantity} shares from ${name(tx.from_shareholder_id)} to ${name(tx.to_shareholder_id)}` : `redeemed ${tx.quantity} shares from ${name(tx.from_shareholder_id)}`;
  await batch(db, [
    stmt(db, 'INSERT INTO share_transactions (id, company_id, share_class_id, kind, from_shareholder_id, to_shareholder_id, quantity, price_per_share, tx_date, certificate_number, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      newId(), co.id, tx.share_class_id, kind, tx.from_shareholder_id, tx.to_shareholder_id, tx.quantity, Math.max(0, Number(s(f.price_per_share)) || 0), s(f.tx_date), s(f.certificate_number), s(f.notes)),
    touch(db, co.id),
    logStmt(db, c.get('user').id, `${displayName(co)}: ${desc}`, { companyId: co.id }),
  ]);
  return redirect(c, back, 'ok', 'Transaction recorded. Draft a supporting resolution under Resolutions.');
});
app.post('/:id/transactions/:tid/delete', async (c) => {
  const db = c.env.DB;
  await batch(db, [
    stmt(db, 'DELETE FROM share_transactions WHERE id = ? AND company_id = ?', c.req.param('tid'), c.req.param('id')),
    logStmt(db, c.get('user').id, 'Deleted a share ledger entry', { companyId: c.req.param('id') }),
  ]);
  return redirect(c, `/companies/${c.req.param('id')}?tab=shares`, 'ok', 'Ledger entry deleted.');
});

export default app;
