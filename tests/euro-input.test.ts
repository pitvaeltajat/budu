import assert from 'node:assert/strict';
import test from 'node:test';
import { euroInputValue, typedEuroCents } from '../lib/euro.ts';

test('typed amounts accept the shapes a person actually writes', () => {
  const cases: [string, number][] = [
    ['1250,50', 125050],
    ['1250.50', 125050],
    ['1250', 125000],
    [' 1250,50 ', 125050],
    ['1250,50 €', 125050],
    // Finnish groups thousands with a space, so stripping it is the point, not
    // a lucky accident.
    ['1 250,50', 125050],
    ['1250,5', 125050],
    ['-40,25', -4025],
    ['0', 0],
    // An emptied field means no allocation, which is how the importer treats a
    // blank plan cell too.
    ['', 0],
    ['   ', 0],
  ];
  for (const [input, expected] of cases) {
    assert.equal(typedEuroCents(input), expected, `${JSON.stringify(input)} should parse to ${expected}`);
  }
});

test('a typo is rejected rather than silently becoming zero', () => {
  // The whole reason this module exists: the importer's forgiving parser strips
  // everything that is not a digit, so each of these would reach it as an empty
  // string and come back as a confident 0, wiping the budget line it was
  // meant to correct.
  for (const input of ['abc', '12o0', '12,345', '1.2.3', '--5', '1,2,3', '50%']) {
    assert.ok(Number.isNaN(typedEuroCents(input)), `${JSON.stringify(input)} should be rejected`);
  }
});

test('an edited amount round-trips through the input field', () => {
  for (const cents of [0, 5, 125050, -4025, 999999999]) {
    assert.equal(typedEuroCents(euroInputValue(cents)), cents);
  }
});
