import assert from 'node:assert/strict';
import test from 'node:test';
import { realizedCents } from '../lib/realized.ts';

const expense = { kind: 'EXPENSE' };
const income = { kind: 'INCOME' };

test('an expense line reads the debit column, an income line the credit one', () => {
  const purchase = { debetCents: 41000, kreditCents: 0 };
  const receipt = { debetCents: 0, kreditCents: 25000 };
  assert.equal(realizedCents(expense, purchase), 41000);
  assert.equal(realizedCents(income, receipt), 25000);
});

test('reclassifying a line reinterprets the same stored entry', () => {
  // The point of the refactor: one row, read two ways, no refetch. An account
  // imported as meno but actually tulo shows a nonsense negative until it is
  // reclassified, and the correct figure immediately afterwards.
  const membershipFee = { debetCents: 0, kreditCents: 25000 };
  assert.equal(realizedCents(expense, membershipFee), -25000);
  assert.equal(realizedCents(income, membershipFee), 25000);
});

test('a refund on an expense account subtracts instead of being dropped', () => {
  const rent = { debetCents: 41000, kreditCents: 0 };
  const refund = { debetCents: 0, kreditCents: 5000 };
  const total = [rent, refund].reduce((sum, entry) => sum + realizedCents(expense, entry), 0);
  assert.equal(total, 36000, 'the refund reduces the spend rather than vanishing');
});

test('an entry carrying both sides nets, and is still distinguishable from nothing', () => {
  const correction = { debetCents: 12000, kreditCents: 12000 };
  assert.equal(realizedCents(expense, correction), 0);
  // A single net column could not tell this apart from an absent entry; both
  // sides are kept precisely so the row itself survives.
  assert.notDeepEqual(correction, { debetCents: 0, kreditCents: 0 });
});
