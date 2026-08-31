import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The same column layout as the supplied Talousarvio: several outturn years,
 * then 2025 twice — its plan followed by how 2025 actually went — and finally
 * the 2026 plan. Picking a year has to land on the plan, not the outturn.
 */
const rows = [
  ['', '', '', '', '2022', '', '', '2023', '', '', '2024', '', '', '2025', '', '', '2025', '', '', '2026'],
  ['Tuotot'],
  [
    '',
    '3010',
    'Retkituotot',
    '',
    '3345',
    '',
    '',
    '3657,5',
    '',
    '',
    '4042,5',
    '',
    '',
    '4000',
    '',
    '',
    '1267,5',
    '',
    '',
    '5000',
  ],
];

test('an earlier year can be imported from the same file', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet(rows, '', 2025);
  assert.equal(result.name, '2025 talousarvio');
  assert.equal(result.startsOn.toISOString(), '2025-01-01T00:00:00.000Z');
  assert.equal(result.endsOn.toISOString(), '2025-12-31T00:00:00.000Z');
  // 400000, the plan; 126750 would be that year's outturn column.
  assert.equal(result.lines[0].plannedCents, 400000);
});

test('no year given still takes the rightmost column', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet(rows);
  assert.equal(result.name, '2026 talousarvio');
  assert.equal(result.lines[0].plannedCents, 500000);
});

test('a year the file does not carry is refused, and says what it has', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  assert.throws(() => parseBudgetWorksheet(rows, '', 2019), /no 2019 column.*2022, 2023, 2024, 2025, 2025, 2026/s);
});

test('the offered years are listed once each', async () => {
  const { talousarvioYears } = await import('../lib/budget-import.ts');
  assert.deepEqual(talousarvioYears(rows), [2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(
    talousarvioYears([
      ['category', 'planned'],
      ['Retket', '100'],
    ]),
    [],
  );
});
