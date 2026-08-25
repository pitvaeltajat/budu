import assert from 'node:assert/strict';
import test from 'node:test';
import { paceFraction, summarisePace, type PaceInput, type PaceLine } from '../lib/budget-pace.ts';

const HALF_YEAR = 182;
const YEAR = 365;

/** A budget of one line, so each case states only what it is about. */
function run(line: PaceLine, used: number, prior = 0, priorFull = 0, elapsedDays = HALF_YEAR) {
  const input: PaceInput = {
    lines: [line],
    usedByCategory: new Map([[line.category, used]]),
    priorByCategory: new Map([[line.category, prior]]),
    priorFullByCategory: new Map([[line.category, priorFull]]),
    elapsedDays,
    totalDays: YEAR,
  };
  return summarisePace(input);
}

const expense = (plannedCents: number): PaceLine => ({ category: 'Retket', kind: 'EXPENSE', plannedCents });
const income = (plannedCents: number): PaceLine => ({ category: 'Jäsenmaksut', kind: 'INCOME', plannedCents });

test('pace follows last year shape when there is one, and the calendar when there is not', () => {
  // Last year 80 % of this line had landed by now, so that is the expectation.
  assert.equal(paceFraction(800, 1000, HALF_YEAR, YEAR), 0.8);
  // A line with no history falls back to elapsed time.
  assert.ok(Math.abs(paceFraction(0, 0, HALF_YEAR, YEAR) - HALF_YEAR / YEAR) < 1e-9);
  // Never zero, so a projection cannot divide by it, and never above one.
  assert.equal(paceFraction(0, 0, 0, YEAR), 0.02);
  assert.equal(paceFraction(1200, 1000, HALF_YEAR, YEAR), 1);
});

test('a line on its own pace raises nothing', () => {
  const { alerts } = run(expense(100_000), 50_000);
  assert.deepEqual(alerts, []);
});

test('spending past the estimate is reported as over, by the euros over', () => {
  const [alert] = run(expense(100_000), 120_000).alerts;
  assert.equal(alert.reason, 'over');
  assert.equal(alert.tone, 'over');
  assert.equal(alert.impactCents, 20_000);
});

test('spending inside the estimate but on a pace that overshoots is reported as projected', () => {
  // Half the year gone, 70 % spent: the year lands near 140 000.
  const [alert] = run(expense(100_000), 70_000).alerts;
  assert.equal(alert.reason, 'projected-over');
  assert.equal(alert.tone, 'ahead');
  assert.ok(alert.projectedCents > 130_000);
});

test('seasonal spending is judged against last year rather than the calendar', () => {
  // The whole camp is paid in spring: 90 % of last year had landed by now, so
  // 90 % spent this year is exactly on pace and must not be flagged.
  assert.deepEqual(run(expense(100_000), 90_000, 90_000, 100_000).alerts, []);
  // The same 90 % on a line that historically spends evenly is a real warning.
  assert.equal(run(expense(100_000), 90_000, 50_000, 100_000).alerts[0].reason, 'projected-over');
});

test('income that should have arrived and has not is reported', () => {
  const [short] = run(income(100_000), 40_000, 80_000, 100_000).alerts;
  assert.equal(short.reason, 'income-short');
  assert.equal(short.tone, 'over', 'less than three quarters of the expected sum is more than a nudge');
  assert.equal(short.impactCents, 40_000);

  const [none] = run(income(100_000), 0, 80_000, 100_000).alerts;
  assert.equal(none.reason, 'income-none');
  assert.equal(none.impactCents, 80_000);
});

test('income that is merely a little behind is a warning, not an alarm', () => {
  const [alert] = run(income(100_000), 65_000, 80_000, 100_000).alerts;
  assert.equal(alert.reason, 'income-short');
  assert.equal(alert.tone, 'ahead');
});

test('income arriving later than last year is not flagged before its time', () => {
  // Nothing has arrived, but nothing had arrived by this point last year either.
  assert.deepEqual(run(income(100_000), 0, 0, 100_000).alerts, []);
});

test('small deviations stay out of the overview', () => {
  // €20 over a €1000 estimate is inside the floor, and 2 % is inside the margin.
  assert.deepEqual(run(expense(100_000), 51_000).alerts, []);
  assert.deepEqual(run(income(100_000), 47_000).alerts, [], 'a few euros of income lag is not worth a card');
  assert.deepEqual(run(expense(0), 2_000).alerts, [], 'trivial unbudgeted spending is noise');
});

test('spending on a line with no estimate is reported once it is material', () => {
  const [alert] = run(expense(0), 30_000).alerts;
  assert.equal(alert.reason, 'unbudgeted');
  assert.equal(alert.impactCents, 30_000);
});

test('alerts are ordered by euros at stake and totals cover both halves', () => {
  const lines: PaceLine[] = [
    { category: 'Kammi', kind: 'EXPENSE', plannedCents: 100_000 },
    { category: 'Retket', kind: 'EXPENSE', plannedCents: 20_000 },
    { category: 'Jäsenmaksut', kind: 'INCOME', plannedCents: 200_000 },
  ];
  const { alerts, expectedExpenseCents, expectedIncomeCents } = summarisePace({
    lines,
    usedByCategory: new Map([
      ['Kammi', 130_000],
      ['Retket', 40_000],
      ['Jäsenmaksut', 0],
    ]),
    priorByCategory: new Map(),
    priorFullByCategory: new Map(),
    elapsedDays: HALF_YEAR,
    totalDays: YEAR,
  });
  assert.deepEqual(
    alerts.map((alert) => alert.category),
    ['Jäsenmaksut', 'Kammi', 'Retket'],
  );
  assert.ok(alerts.every((alert, index) => index === 0 || alerts[index - 1].impactCents >= alert.impactCents));
  // Half the year gone with no history: half of each side is expected by now.
  assert.equal(expectedExpenseCents, 59_836);
  assert.equal(expectedIncomeCents, 99_726);
});
