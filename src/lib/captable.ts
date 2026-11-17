import type { ShareClass, Shareholder, ShareTx } from './types.ts';

type Holdings = Map<string, Map<string, number>>; // shareholderId -> classId -> qty

type TxLike = Pick<ShareTx, 'kind' | 'share_class_id' | 'from_shareholder_id' | 'to_shareholder_id' | 'quantity'>;

export function computeHoldings(txs: TxLike[]): Holdings {
  const h: Holdings = new Map();
  const add = (sh: string | null, cls: string, q: number) => {
    if (!sh) return;
    if (!h.has(sh)) h.set(sh, new Map());
    const m = h.get(sh)!;
    m.set(cls, (m.get(cls) ?? 0) + q);
  };
  for (const t of txs) {
    if (t.kind === 'issuance') add(t.to_shareholder_id, t.share_class_id, t.quantity);
    else if (t.kind === 'transfer') {
      add(t.from_shareholder_id, t.share_class_id, -t.quantity);
      add(t.to_shareholder_id, t.share_class_id, t.quantity);
    } else if (t.kind === 'redemption') add(t.from_shareholder_id, t.share_class_id, -t.quantity);
  }
  return h;
}

export function outstanding(txs: TxLike[], classId: string): number {
  let n = 0;
  for (const t of txs) {
    if (t.share_class_id !== classId) continue;
    if (t.kind === 'issuance') n += t.quantity;
    if (t.kind === 'redemption') n -= t.quantity;
  }
  return n;
}

/** Returns an error message if `tx` cannot be applied on top of `existing`, else null. */
export function validateTx(existing: TxLike[], tx: TxLike, cls: ShareClass | undefined): string | null {
  if (!cls) return 'Choose a share class.';
  if (!Number.isInteger(tx.quantity) || tx.quantity <= 0) return 'Quantity must be a positive whole number.';
  if (tx.kind === 'issuance') {
    if (!tx.to_shareholder_id) return 'Choose who receives the shares.';
    if (cls.max_shares != null && outstanding(existing, cls.id) + tx.quantity > cls.max_shares) {
      return `${cls.name} is limited to ${cls.max_shares.toLocaleString()} shares.`;
    }
    return null;
  }
  if (!tx.from_shareholder_id) return 'Choose the shareholder giving up the shares.';
  if (tx.kind === 'transfer') {
    if (!tx.to_shareholder_id) return 'Choose who receives the shares.';
    if (tx.to_shareholder_id === tx.from_shareholder_id) return 'A shareholder cannot transfer shares to themselves.';
  }
  const held = computeHoldings(existing).get(tx.from_shareholder_id)?.get(cls.id) ?? 0;
  if (tx.quantity > held) return `That shareholder only holds ${held.toLocaleString()} ${cls.name} shares.`;
  return null;
}

export interface CapRow { shareholder: Shareholder; byClass: Record<string, number>; total: number; pctEquity: number; pctVoting: number }
export interface CapTable { rows: CapRow[]; classTotals: Record<string, number>; total: number; votingTotal: number }

export function capTable(shareholders: Shareholder[], classes: ShareClass[], txs: TxLike[]): CapTable {
  const h = computeHoldings(txs);
  const voting = new Set(classes.filter((c) => c.voting).map((c) => c.id));
  const classTotals: Record<string, number> = Object.fromEntries(classes.map((c) => [c.id, 0]));
  let total = 0;
  let votingTotal = 0;
  const rows: CapRow[] = [];
  for (const sh of shareholders) {
    const m = h.get(sh.id) ?? new Map<string, number>();
    const byClass: Record<string, number> = {};
    let t = 0;
    let v = 0;
    for (const c of classes) {
      const q = m.get(c.id) ?? 0;
      byClass[c.id] = q;
      classTotals[c.id] += q;
      t += q;
      if (voting.has(c.id)) v += q;
    }
    total += t;
    votingTotal += v;
    rows.push({ shareholder: sh, byClass, total: t, pctEquity: 0, pctVoting: v });
  }
  for (const r of rows) {
    r.pctEquity = total ? (r.total / total) * 100 : 0;
    r.pctVoting = votingTotal ? (r.pctVoting / votingTotal) * 100 : 0;
  }
  rows.sort((a, b) => b.total - a.total || a.shareholder.name.localeCompare(b.shareholder.name));
  return { rows, classTotals, total, votingTotal };
}
