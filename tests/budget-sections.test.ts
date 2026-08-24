import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNoOverlap, sectionForAccount, sectionSortKey, OTHER_SECTION, BUDGET_SECTIONS } from '../lib/budget-sections.ts';

test('section ranges do not overlap', () => {
  assert.equal(assertNoOverlap(), true);
});

test('accounts land in the section the budget expects', () => {
  const cases: [number, string][] = [
    [3010, 'Varsinaisen toiminnan tuotot'],
    [3300, 'Varsinaisen toiminnan tuotot'],
    [3500, 'Kammin tuotot ja kulut'],
    [4210, 'Varsinaisen toiminnan kulut'],
    [4840, 'Varsinaisen toiminnan kulut'],
    [4411, 'Toimitilakulut'],
    [4580, 'Kammin tuotot ja kulut'],
    [4610, 'Kone- ja kalustokulut'],
    [4990, 'Hallintokulut'],
    [5030, 'Varainhankinnan tuotot'],
    [5120, 'Varainhankinnan kulut'],
    [6020, 'Sijoitus- ja rahoitustoiminnan tuotot'],
    [6110, 'Sijoitus- ja rahoitustoiminnan kulut'],
    [7010, 'Satunnaiset erät'],
    [7510, 'Avustukset'],
    [8020, 'Poistot'],
    // Donations are booked outside the 7xxx block but belong with them.
    [8825, 'Satunnaiset erät'],
  ];
  for (const [account, expected] of cases) assert.equal(sectionForAccount(account), expected, `account ${account}`);
});

test('an unknown account is kept rather than dropped, and sorts last', () => {
  assert.equal(sectionForAccount(1910), OTHER_SECTION);
  assert.equal(sectionSortKey(1910), BUDGET_SECTIONS.length);
  assert.ok(sectionSortKey(3010) < sectionSortKey(1910));
});
