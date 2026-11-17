import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, anniversary, isIso } from '../src/lib/dates.ts';
import { annualReturnDue, firstFiscalYearEnd, itemState, scheduleForCompany } from '../src/lib/compliance.ts';
import { capTable, validateTx } from '../src/lib/captable.ts';
import { buildLegalName, checkName, similarNames } from '../src/lib/names.ts';
import { JURISDICTIONS } from '../src/lib/jurisdictions.ts';
import type { ShareClass, Shareholder, ShareTx } from '../src/lib/types.ts';

test('dates: month math clamps to month end and leap days', () => {
  assert.equal(addMonths('2025-01-31', 1), '2025-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(anniversary('2024-02-29', 2025), '2025-02-28');
  assert.equal(isIso('2025-02-30'), false);
  assert.equal(isIso('2025-02-28'), true);
});

test('annual return due dates follow each jurisdiction rule', () => {
  assert.equal(annualReturnDue('2023-03-14', JURISDICTIONS.CA, 2025), '2025-05-13'); // +60 days
  assert.equal(annualReturnDue('2023-03-14', JURISDICTIONS.BC, 2025), '2025-05-14'); // +2 months
  assert.equal(annualReturnDue('2023-03-14', JURISDICTIONS.AB, 2025), '2025-04-30'); // end of next month
});

test('first fiscal year end is on/after incorporation', () => {
  assert.equal(firstFiscalYearEnd('2025-03-01', '12-31'), '2025-12-31');
  assert.equal(firstFiscalYearEnd('2025-03-01', '01-31'), '2026-01-31');
});

test('schedule includes annual returns and FYE-driven items within window', () => {
  const items = scheduleForCompany({ incorporation_date: '2024-06-15', fiscal_year_end: '12-31' }, JURISDICTIONS.ON, '2025-01-01', '2025-12-31');
  const kinds = items.map((i) => `${i.kind}:${i.due_date}`);
  assert.ok(kinds.includes('annual_return:2025-08-14'));
  assert.ok(kinds.includes('tax_balance:2025-02-28'));
  assert.ok(kinds.includes('t2_return:2025-06-30'));
  assert.ok(kinds.includes('annual_resolutions:2025-06-30'));
  assert.deepEqual(items.map((i) => i.due_date), [...items.map((i) => i.due_date)].sort());
});

test('no annual return in the incorporation year', () => {
  const items = scheduleForCompany({ incorporation_date: '2025-02-01', fiscal_year_end: null }, JURISDICTIONS.CA, '2025-01-01', '2025-12-31');
  assert.equal(items.length, 0);
});

test('item state', () => {
  assert.equal(itemState({ due_date: '2025-01-01', completed_on: null }, '2025-01-02'), 'overdue');
  assert.equal(itemState({ due_date: '2025-01-20', completed_on: null }, '2025-01-02'), 'due_soon');
  assert.equal(itemState({ due_date: '2025-06-01', completed_on: null }, '2025-01-02'), 'upcoming');
  assert.equal(itemState({ due_date: '2025-01-01', completed_on: '2024-12-01' }, '2025-01-02'), 'done');
});

const cls = (id: string, voting = 1, max: number | null = null): ShareClass => ({ id, company_id: 'c', name: id, voting, participating: 1, max_shares: max, rights: null, sort: 0 });
const sh = (id: string): Shareholder => ({ id, company_id: 'c', name: id, kind: 'individual', address: null, email: null });
const tx = (p: Partial<ShareTx>): ShareTx => ({ id: 'x', company_id: 'c', share_class_id: 'A', kind: 'issuance', from_shareholder_id: null, to_shareholder_id: null, quantity: 1, price_per_share: 1, tx_date: '2025-01-01', certificate_number: null, notes: null, ...p });

test('cap table handles issuances, transfers, redemptions and voting %', () => {
  const txs = [
    tx({ to_shareholder_id: 'alice', quantity: 60 }),
    tx({ to_shareholder_id: 'bob', quantity: 40 }),
    tx({ kind: 'transfer', from_shareholder_id: 'alice', to_shareholder_id: 'bob', quantity: 10 }),
    tx({ share_class_id: 'B', to_shareholder_id: 'alice', quantity: 100 }),
    tx({ kind: 'redemption', from_shareholder_id: 'bob', quantity: 5 }),
  ];
  const cap = capTable([sh('alice'), sh('bob')], [cls('A'), cls('B', 0)], txs);
  const alice = cap.rows.find((r) => r.shareholder.id === 'alice')!;
  const bob = cap.rows.find((r) => r.shareholder.id === 'bob')!;
  assert.equal(alice.byClass.A, 50);
  assert.equal(bob.byClass.A, 45);
  assert.equal(cap.total, 195);
  assert.equal(cap.votingTotal, 95);
  assert.equal(alice.pctVoting.toFixed(2), (50 / 95 * 100).toFixed(2));
});

test('validateTx blocks over-transfers, self-transfers and authorized cap', () => {
  const existing = [tx({ to_shareholder_id: 'alice', quantity: 10 })];
  assert.match(validateTx(existing, { kind: 'transfer', share_class_id: 'A', from_shareholder_id: 'alice', to_shareholder_id: 'bob', quantity: 11 }, cls('A'))!, /only holds 10/);
  assert.match(validateTx(existing, { kind: 'transfer', share_class_id: 'A', from_shareholder_id: 'alice', to_shareholder_id: 'alice', quantity: 1 }, cls('A'))!, /themselves/);
  assert.match(validateTx(existing, { kind: 'issuance', share_class_id: 'A', from_shareholder_id: null, to_shareholder_id: 'bob', quantity: 5 }, cls('A', 1, 12))!, /limited to 12/);
  assert.equal(validateTx(existing, { kind: 'redemption', share_class_id: 'A', from_shareholder_id: 'alice', to_shareholder_id: null, quantity: 10 }, cls('A')), null);
  assert.match(validateTx(existing, { kind: 'issuance', share_class_id: 'A', from_shareholder_id: null, to_shareholder_id: 'bob', quantity: 1.5 }, cls('A'))!, /whole number/);
});

test('names: build, check and detect duplicates', () => {
  assert.equal(buildLegalName({ name_type: 'named', distinctive: 'Northern Cedar', descriptive: 'Consulting', legal_ending: 'Inc.' }, JURISDICTIONS.ON), 'Northern Cedar Consulting Inc.');
  assert.equal(buildLegalName({ name_type: 'numbered', corp_number: 'BC1234567' }, JURISDICTIONS.BC), '1234567 B.C. Ltd.');
  assert.equal(buildLegalName({ name_type: 'numbered', corp_number: '1534221-7' }, JURISDICTIONS.CA), '1534221 Canada Inc.');
  assert.ok(checkName({ name_type: 'named', distinctive: '', legal_ending: 'Inc.' }, JURISDICTIONS.CA).errors.length);
  assert.ok(checkName({ name_type: 'named', distinctive: 'Acme', descriptive: 'Bank', legal_ending: 'Inc.' }, JURISDICTIONS.CA).warnings.some((w) => w.includes('bank')));
  assert.ok(checkName({ name_type: 'named', distinctive: 'Acme', descriptive: 'Bakery', legal_ending: 'S.A.R.F.' }, JURISDICTIONS.ON).errors.length);
  assert.deepEqual(similarNames('Northern Cedar Consulting Ltd.', [{ id: '1', legal_name: 'Northern Cedar Consulting Inc.' }, { id: '2', legal_name: 'Other Co Inc.' }]).map((x) => x.id), ['1']);
});
