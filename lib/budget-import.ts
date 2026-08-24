export type BudgetImportLine = {
  category: string;
  plannedCents: number;
  description?: string;
  kitsasAccount?: number;
  kind: 'INCOME' | 'EXPENSE';
};

export type ParsedBudget = {
  name: string;
  currency: string;
  startsOn?: Date;
  endsOn?: Date;
  lines: BudgetImportLine[];
};

type RecordRow = Record<string, unknown>;

const text = (value: unknown) => String(value ?? '').trim();
const normalized = (key: string) => key.trim().toLowerCase().replace(/\s+/g, '_');

export function euroCents(value: unknown) {
  const amount = Number(text(value).replace(/\u00a0|\s/g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function unique(lines: BudgetImportLine[]) {
  const duplicate = lines.map((line) => line.category.toLowerCase()).find((value, index, all) => all.indexOf(value) !== index);
  if (duplicate) throw new Error(`Categories must be unique. Duplicate: ${duplicate}`);
  return lines;
}

function parseSimpleBudget(records: RecordRow[], submittedName: string): ParsedBudget {
  const lines = records.map((record) => {
    const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalized(key), value]));
    const account = text(fields.account || fields.tilinumero);
    return {
      category: text(fields.category),
      plannedCents: euroCents(fields.planned),
      description: text(fields.description) || undefined,
      kitsasAccount: account ? Number(account) : undefined,
      kind: account && Number(account) >= 3000 && Number(account) < 4000 ? 'INCOME' as const : 'EXPENSE' as const,
    };
  }).filter((line) => line.category || Number.isFinite(line.plannedCents));
  if (!lines.length) throw new Error('No budget rows were found.');
  if (lines.some((line) => !line.category || !Number.isFinite(line.plannedCents))) throw new Error('Every row needs a category and a valid planned amount.');
  if (lines.some((line) => line.kitsasAccount !== undefined && !Number.isInteger(line.kitsasAccount))) throw new Error('Account must be an integer Kitsas account number.');
  const first = records[0] || {};
  const value = (key: string) => Object.entries(first).find(([name]) => normalized(name) === key)?.[1];
  return { name: submittedName || text(value('budget_name')) || 'Imported budget', currency: (text(value('currency')) || 'EUR').toUpperCase(), lines: unique(lines) };
}

/** Parse the Finnish multi-year Talousarvio export, selecting its rightmost year column. */
function parseTalousarvio(rows: unknown[][], submittedName: string): ParsedBudget {
  const yearRow = rows.find((row) => row.some((value) => /^20\d{2}$/.test(text(value))));
  if (!yearRow) throw new Error('Could not find a year row in the Talousarvio file.');
  const years = yearRow.map((value, index) => ({ year: Number(text(value)), index })).filter(({ year }) => Number.isInteger(year) && year >= 2000);
  const selected = years.at(-1);
  if (!selected) throw new Error('Could not find a budget-year column.');
  const lines: BudgetImportLine[] = [];
  for (const row of rows) {
    const account = Number(text(row[1])); const description = text(row[2]); const planned = text(row[selected.index]);
    if (!Number.isInteger(account) || !description) continue;
    // Empty plan cells in this particular budget mean no allocation, rather
    // than an invalid row. Keep them so every Kitsas account remains mapped.
    const plannedCents = planned ? euroCents(planned) : 0;
    if (!Number.isFinite(plannedCents)) throw new Error(`Invalid ${selected.year} amount for account ${account}.`);
    lines.push({ category: `${account} — ${description}`, description, kitsasAccount: account, plannedCents, kind: account >= 3000 && account < 4000 ? 'INCOME' : 'EXPENSE' });
  }
  if (!lines.length) throw new Error('No account rows were found in the Talousarvio file.');
  return {
    name: submittedName || `${selected.year} talousarvio`, currency: 'EUR',
    startsOn: new Date(`${selected.year}-01-01T00:00:00.000Z`), endsOn: new Date(`${selected.year}-12-31T00:00:00.000Z`), lines: unique(lines),
  };
}

export function parseBudgetWorksheet(rows: unknown[][], submittedName = ''): ParsedBudget {
  const firstNonEmpty = rows.find((row) => row.some((value) => text(value)));
  const hasSimpleHeaders = firstNonEmpty?.some((value) => ['category', 'planned'].includes(normalized(text(value))));
  if (hasSimpleHeaders) {
    const headers = firstNonEmpty!.map(text);
    const index = rows.indexOf(firstNonEmpty!);
    const records = rows.slice(index + 1).map((row) => Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])));
    return parseSimpleBudget(records, submittedName);
  }
  return parseTalousarvio(rows, submittedName);
}
