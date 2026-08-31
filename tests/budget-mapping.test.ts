import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAccount, duplicateAccounts, INVALID_ACCOUNT } from '../lib/budget-mapping.ts';

test('an account number is read as a number', () => {
  assert.equal(parseAccount('4210'), 4210);
  assert.equal(parseAccount(' 4210 '), 4210);
});

test('blank clears the mapping rather than failing', () => {
  // A talousarvio row with no counterpart in the book is normal; refusing it
  // would push people into inventing an account number.
  assert.equal(parseAccount(''), null);
  assert.equal(parseAccount('   '), null);
});

test('anything that is not a plain account number is refused', () => {
  for (const raw of ['42a0', '-4210', '4210,5', '4210.5', '0', '1234567', 'tili 4210'])
    assert.equal(parseAccount(raw), INVALID_ACCOUNT, `expected ${raw} to be refused`);
});

test('an account claimed twice is reported', () => {
  assert.deepEqual(duplicateAccounts([4210, 3010, 4210]), [4210]);
});

test('several duplicates come back in order, once each', () => {
  assert.deepEqual(duplicateAccounts([4210, 3010, 4210, 3010, 4210]), [3010, 4210]);
});

test('unmapped rows never collide with each other', () => {
  // null is "no account", and any number of rows may have no account.
  assert.deepEqual(duplicateAccounts([null, null, null]), []);
  assert.deepEqual(duplicateAccounts([null, 4210, null]), []);
});

test('a clean mapping reports nothing', () => {
  assert.deepEqual(duplicateAccounts([3010, 3015, 4210, null]), []);
});
