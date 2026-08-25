import assert from 'node:assert/strict';
import test from 'node:test';

// This mirrors the relevant layout in the supplied multi-year Talousarvio CSV:
// tilinumero is column B and 2026 is its rightmost year column.
test('Talousarvio rows retain tilinumero as the Kitsas account mapping', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet([
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
      '4000',
    ],
    [
      '',
      '4210',
      'Retkikulut',
      '',
      '2624,8',
      '',
      '',
      '3292,25',
      '',
      '',
      '2893,7',
      '',
      '',
      '4000',
      '',
      '',
      '1504,24',
      '',
      '',
      '4000',
    ],
  ]);
  assert.equal(result.name, '2026 talousarvio');
  assert.equal(result.lines.length, 2);
  assert.deepEqual(result.lines[0], {
    category: '3010 — Retkituotot',
    description: 'Retkituotot',
    kitsasAccount: 3010,
    plannedCents: 400000,
    kind: 'INCOME',
  });
  assert.deepEqual(result.lines[1], {
    category: '4210 — Retkikulut',
    description: 'Retkikulut',
    kitsasAccount: 4210,
    plannedCents: 400000,
    kind: 'EXPENSE',
  });
});

test('Talousarvio uses income account ranges beyond 3000', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet([
    ['', '', '', '2026'],
    ['', '3500', 'Kammin vuokratuotot', '', '4000'],
    ['', '5010', 'Pukkipalvelun tuotot', '', '350'],
    ['', '7510', 'Kaupungin avustukset', '', '4600'],
    ['', '8825', 'Lahjoitukset', '', '100'],
    ['', '4210', 'Retkikulut', '', '4000'],
  ]);
  assert.deepEqual(
    result.lines.map(({ kind }) => kind),
    ['INCOME', 'INCOME', 'INCOME', 'INCOME', 'EXPENSE'],
  );
});

test('simple imports allow a per-row kind override', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet([
    ['category', 'planned', 'account', 'kind'],
    ['Grant', '100', '4210', 'income'],
    ['Correction', '100', '3010', 'expense'],
  ]);
  assert.deepEqual(
    result.lines.map(({ kind }) => kind),
    ['INCOME', 'EXPENSE'],
  );
});

test('Talousarvio repairs UTF-8 decoded as Latin-1', async () => {
  const { parseBudgetWorksheet } = await import('../lib/budget-import.ts');
  const result = parseBudgetWorksheet([
    ['', '', '', '2026'],
    ['', '4271', 'Lippukunnan myÃ¶ntÃ¤mÃ¤t stipendit', '', '0'],
  ]);
  assert.equal(result.lines[0].description, 'Lippukunnan myöntämät stipendit');
});
