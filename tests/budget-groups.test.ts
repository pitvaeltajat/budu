import assert from 'node:assert/strict';
import test from 'node:test';
import { sectionsOf, worthTotalling } from '../lib/budget-groups.ts';

const line = (category: string, groupName: string | null, kind: string, plannedCents: number) => ({
  category,
  groupName,
  kind,
  plannedCents,
});

const used = new Map([
  ['a', 1000],
  ['b', 2000],
  ['c', 500],
]);
const prior = new Map([
  ['a', 900],
  ['b', 100],
]);

test('rows are grouped into the sections they are headed by', () => {
  const sections = sectionsOf(
    [line('a', 'Tuotot', 'INCOME', 5000), line('b', 'Tuotot', 'INCOME', 3000), line('c', 'Kulut', 'EXPENSE', 4000)],
    used,
    prior,
  );
  assert.deepEqual(
    sections.map((s) => s.name),
    ['Tuotot', 'Kulut'],
  );
  assert.deepEqual(sections[0].totals, [
    { kind: 'INCOME', rows: 2, plannedCents: 8000, usedCents: 3000, priorCents: 1000 },
  ]);
});

test('a section holding both kinds is totalled separately for each', () => {
  // "Satunnaiset erät" spans 7000–7199 and 8825; adding tuotot to kulut would
  // produce a number that means nothing.
  const sections = sectionsOf(
    [
      line('a', 'Satunnaiset erät', 'INCOME', 5000),
      line('b', 'Satunnaiset erät', 'EXPENSE', 3000),
      line('c', 'Satunnaiset erät', 'EXPENSE', 1000),
    ],
    used,
    prior,
  );
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].totals, [
    { kind: 'INCOME', rows: 1, plannedCents: 5000, usedCents: 1000, priorCents: 900 },
    { kind: 'EXPENSE', rows: 2, plannedCents: 4000, usedCents: 2500, priorCents: 100 },
  ]);
});

test('rows with nothing booked to them count as zero, not as missing', () => {
  const sections = sectionsOf([line('unbooked', 'Kulut', 'EXPENSE', 7000)], new Map(), new Map());
  assert.deepEqual(sections[0].totals, [{ kind: 'EXPENSE', rows: 1, plannedCents: 7000, usedCents: 0, priorCents: 0 }]);
});

test('the same heading appearing twice stays two sections', () => {
  // Grouping is by consecutive run, so the table's order and its headings can
  // never disagree — even if the sheet repeats a name out of order.
  const sections = sectionsOf(
    [line('a', 'Kulut', 'EXPENSE', 1), line('b', 'Tuotot', 'INCOME', 1), line('c', 'Kulut', 'EXPENSE', 1)],
    used,
    prior,
  );
  assert.equal(sections.length, 3);
});

test('rows carrying no heading group together', () => {
  const sections = sectionsOf([line('a', null, 'EXPENSE', 1), line('b', null, 'EXPENSE', 1)], used, prior);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].name, null);
});

test('a one-row section is its own total and gets no subtotal', () => {
  const [only] = sectionsOf([line('a', 'Poistot', 'EXPENSE', 1000)], used, prior);
  assert.equal(worthTotalling(only), false);
  const [two] = sectionsOf([line('a', 'Poistot', 'EXPENSE', 1), line('b', 'Poistot', 'EXPENSE', 1)], used, prior);
  assert.equal(worthTotalling(two), true);
});
