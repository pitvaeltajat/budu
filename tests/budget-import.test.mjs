import assert from 'node:assert/strict';
import test from 'node:test';

// This mirrors the relevant layout in the supplied multi-year Talousarvio CSV:
// tilinumero is column B and 2026 is its rightmost year column.
test('Talousarvio rows retain tilinumero as the Kitsas account mapping', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet([
    ['', '', '', '', '2022', '', '', '2023', '', '', '2024', '', '', '2025', '', '', '2025', '', '', '2026'],
    ['Tuotot'],
    ['', '3010', 'Retkituotot', '', '3345', '', '', '3657,5', '', '', '4042,5', '', '', '4000', '', '', '1267,5', '', '', '4000'],
    ['', '4210', 'Retkikulut', '', '2624,8', '', '', '3292,25', '', '', '2893,7', '', '', '4000', '', '', '1504,24', '', '', '4000'],
  ]);
  assert.equal(result.name, '2026 talousarvio');
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0], { category: '3010 — Retkituotot', description: 'Retkituotot', kitsasAccount: 3010, plannedCents: 400000, kind: 'INCOME' });
  assert.deepEqual(result.lines[1], { category: '4210 — Retkikulut', description: 'Retkikulut', kitsasAccount: 4210, plannedCents: 400000, kind: 'EXPENSE' });
});
