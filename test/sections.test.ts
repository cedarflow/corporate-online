import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsBetween, vestedQuantity } from '../src/lib/vesting.ts';
import { AGREEMENTS } from '../src/lib/agreements.ts';
import { getTemplate } from '../src/lib/resolutions.ts';
import { JURISDICTIONS } from '../src/lib/jurisdictions.ts';
import type { Company, ShareClass, Shareholder, ShareTx } from '../src/lib/types.ts';

test('months between respects day of month', () => {
  assert.equal(monthsBetween('2025-01-15', '2025-02-14'), 0);
  assert.equal(monthsBetween('2025-01-15', '2025-02-15'), 1);
  assert.equal(monthsBetween('2025-01-31', '2026-01-31'), 12);
});

test('vesting: nothing before cliff, monthly after, capped at total', () => {
  const g = { quantity: 4800, grant_date: '2025-01-01', vesting_start: null, vesting_months: 48, cliff_months: 12 };
  assert.equal(vestedQuantity(g, '2025-12-31'), 0);
  assert.equal(vestedQuantity(g, '2026-01-01'), 1200);
  assert.equal(vestedQuantity(g, '2026-07-01'), 1800);
  assert.equal(vestedQuantity(g, '2030-01-01'), 4800);
  assert.equal(vestedQuantity({ ...g, vesting_months: 0 }, '2025-01-01'), 4800);
  assert.equal(vestedQuantity(g, '2024-06-01'), 0);
});

test('every agreement template builds with and without parameters', () => {
  for (const a of AGREEMENTS) {
    for (const params of [{}, Object.fromEntries(a.params.map((p) => [p.name, p.type === 'number' ? '1000' : p.type === 'date' ? '2026-01-15' : 'Test Value']))]) {
      const out = a.build({ legalName: 'ALT TECH SUPPORT INC.', j: JURISDICTIONS.BC, date: '2026-01-10', params, officer: 'Mark Perrin' });
      assert.ok(out.title.length > 3, a.kind);
      assert.ok(out.body.includes('ALT TECH SUPPORT INC.'), a.kind);
      assert.ok(!out.body.includes('undefined') && !out.body.includes('NaN'), `${a.kind} has undefined/NaN`);
    }
  }
});

test('dividend resolution splits pro rata by class', () => {
  const cls: ShareClass[] = [{ id: 'A', company_id: 'c', name: 'Class A', voting: 1, participating: 1, max_shares: null, rights: null, sort: 0 }];
  const sh: Shareholder[] = ['Ann', 'Bob'].map((n) => ({ id: n, company_id: 'c', name: n, kind: 'individual', address: null, email: null }));
  const tx = (to: string, q: number): ShareTx => ({ id: to, company_id: 'c', share_class_id: 'A', kind: 'issuance', from_shareholder_id: null, to_shareholder_id: to, quantity: q, price_per_share: 1, tx_date: '2025-01-01', certificate_number: null, notes: null });
  const out = getTemplate('dividend')!.build({
    company: { fiscal_year_end: '12-31', registered_office: null } as Company, j: JURISDICTIONS.BC, legalName: 'X INC.', directors: [], officers: [],
    shareholders: sh, classes: cls, txs: [tx('Ann', 750), tx('Bob', 250)], date: '2026-01-01', params: { class: 'Class A', amount: '1000' },
  });
  assert.match(out.body, /Ann: 750 shares, \$750\.00/);
  assert.match(out.body, /Bob: 250 shares, \$250\.00/);
});
