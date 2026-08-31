import assert from 'node:assert/strict';
import test from 'node:test';
import { activeFirst, coversToday } from '../lib/budget-period.ts';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const budget = (name: string, year: number | null, updatedAt: string) => ({
  name,
  startsOn: year === null ? null : day(`${year}-01-01`),
  endsOn: year === null ? null : day(`${year}-12-31`),
  updatedAt: day(updatedAt),
});

const now = day('2026-08-31');

test('the live period wins over a more recent upload', () => {
  // Importing 2025 for comparison must not take over the front page just by
  // being the newest thing uploaded.
  const order = activeFirst([budget('2026', 2026, '2026-08-01'), budget('2025', 2025, '2026-08-30')], now);
  assert.deepEqual(
    order.map((item) => item.name),
    ['2026', '2025'],
  );
});

test('with no live period, the newest period leads', () => {
  const order = activeFirst([budget('2024', 2024, '2026-08-30'), budget('2025', 2025, '2026-08-01')], now);
  assert.deepEqual(
    order.map((item) => item.name),
    ['2025', '2024'],
  );
});

test('budgets carrying no period fall back to when they were touched', () => {
  const order = activeFirst([budget('older', null, '2026-01-01'), budget('newer', null, '2026-06-01')], now);
  assert.deepEqual(
    order.map((item) => item.name),
    ['newer', 'older'],
  );
});

test('a period with no dates is never the live one', () => {
  assert.equal(coversToday(budget('undated', null, '2026-08-30'), now), false);
  assert.equal(coversToday(budget('2026', 2026, '2026-08-30'), now), true);
  assert.equal(coversToday(budget('2025', 2025, '2026-08-30'), now), false);
});

test('the last day of a period still counts as live', () => {
  assert.equal(coversToday(budget('2026', 2026, '2026-01-01'), day('2026-12-31')), true);
});
