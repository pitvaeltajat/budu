import { sectionForAccount, sectionSortKey } from './budget-sections';

export type BudgetImportLine = {
  category: string;
  plannedCents: number;
  description?: string;
  groupName?: string;
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

function repairMojibake(value: string) {
  // Some Finnish CSV exports contain UTF-8 bytes decoded once as Latin-1
  // (e.g. "myÃ¶ntÃ¤mÃ¤t"). Repair that common form at the import boundary.
  if (!/[ÃÂâ]/.test(value) || typeof Buffer === 'undefined') return value;
  try {
    const repaired = Buffer.from(value, 'latin1').toString('utf8');
    return repaired.includes('�') ? value : repaired;
  } catch {
    return value;
  }
}

const text = (value: unknown) => repairMojibake(String(value ?? '').trim());
const normalized = (key: string) => key.trim().toLowerCase().replace(/\s+/g, '_');

// The association's chart of accounts has income outside the usual 30xx
// range too (fundraising, finance, extraordinary income and grants). Keep the
// default explicit, while allowing an import row to override it.
const incomeAccount = (account: number) =>
  (account >= 3000 && account < 4000) ||
  (account >= 5000 && account < 5100) ||
  (account >= 6000 && account < 6100) ||
  (account >= 7000 && account < 7100) ||
  (account >= 7500 && account < 7600) ||
  account === 8825;

function rowKind(value: unknown, account?: number): 'INCOME' | 'EXPENSE' {
  const override = text(value).toLowerCase();
  if (['income', 'tulo', 'tuotto', 'revenue'].includes(override)) return 'INCOME';
  if (['expense', 'meno', 'kulu', 'cost'].includes(override)) return 'EXPENSE';
  return account !== undefined && incomeAccount(account) ? 'INCOME' : 'EXPENSE';
}

export function euroCents(value: unknown) {
  const amount = Number(
    text(value)
      .replace(/\u00a0|\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, ''),
  );
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
}

function unique(lines: BudgetImportLine[]) {
  const duplicate = lines
    .map((line) => line.category.toLowerCase())
    .find((value, index, all) => all.indexOf(value) !== index);
  if (duplicate) throw new Error(`Categories must be unique. Duplicate: ${duplicate}`);
  return lines;
}

function parseSimpleBudget(records: RecordRow[], submittedName: string): ParsedBudget {
  const lines = records
    .map((record) => {
      const fields = Object.fromEntries(Object.entries(record).map(([key, value]) => [normalized(key), value]));
      const account = text(fields.account || fields.tilinumero);
      return {
        category: text(fields.category),
        plannedCents: euroCents(fields.planned),
        description: text(fields.description) || undefined,
        groupName: account
          ? sectionForAccount(Number(account))
          : text(fields.group || fields.ryhma || fields.otsikko) || undefined,
        kitsasAccount: account ? Number(account) : undefined,
        kind: rowKind(fields.kind || fields.type || fields.tulo_meno, account ? Number(account) : undefined),
      };
    })
    .filter((line) => line.category || Number.isFinite(line.plannedCents));
  if (!lines.length) throw new Error('No budget rows were found.');
  if (lines.some((line) => !line.category || !Number.isFinite(line.plannedCents)))
    throw new Error('Every row needs a category and a valid planned amount.');
  if (lines.some((line) => line.kitsasAccount !== undefined && !Number.isInteger(line.kitsasAccount)))
    throw new Error('Account must be an integer Kitsas account number.');
  const first = records[0] || {};
  const value = (key: string) => Object.entries(first).find(([name]) => normalized(name) === key)?.[1];
  return {
    name: submittedName || text(value('budget_name')) || 'Imported budget',
    currency: (text(value('currency')) || 'EUR').toUpperCase(),
    lines: unique(lines),
  };
}

/** Parse the Finnish multi-year Talousarvio export, selecting its rightmost year column. */
function parseTalousarvio(rows: unknown[][], submittedName: string): ParsedBudget {
  const yearRow = rows.find((row) => row.some((value) => /^20\d{2}$/.test(text(value))));
  if (!yearRow) throw new Error('Could not find a year row in the Talousarvio file.');
  const years = yearRow
    .map((value, index) => ({ year: Number(text(value)), index }))
    .filter(({ year }) => Number.isInteger(year) && year >= 2000);
  const selected = years.at(-1);
  if (!selected) throw new Error('Could not find a budget-year column.');
  const lines: BudgetImportLine[] = [];
  for (const row of rows) {
    const account = Number(text(row[1]));
    const description = text(row[2]);
    const planned = text(row[selected.index]);
    if (!Number.isInteger(account) || !description) continue;
    // Empty plan cells in this particular budget mean no allocation, rather
    // than an invalid row. Keep them so every Kitsas account remains mapped.
    const plannedCents = planned ? euroCents(planned) : 0;
    if (!Number.isFinite(plannedCents)) throw new Error(`Invalid ${selected.year} amount for account ${account}.`);
    // Headings in the sheet are ignored: the account number decides the section.
    lines.push({
      category: `${account} — ${description}`,
      description,
      groupName: sectionForAccount(account),
      kitsasAccount: account,
      plannedCents,
      kind: rowKind(undefined, account),
    });
  }
  lines.sort(
    (a, b) =>
      sectionSortKey(a.kitsasAccount!) - sectionSortKey(b.kitsasAccount!) || a.kitsasAccount! - b.kitsasAccount!,
  );
  if (!lines.length) throw new Error('No account rows were found in the Talousarvio file.');
  return {
    name: submittedName || `${selected.year} talousarvio`,
    currency: 'EUR',
    startsOn: new Date(`${selected.year}-01-01T00:00:00.000Z`),
    endsOn: new Date(`${selected.year}-12-31T00:00:00.000Z`),
    lines: unique(lines),
  };
}

export function parseBudgetWorksheet(rows: unknown[][], submittedName = ''): ParsedBudget {
  const firstNonEmpty = rows.find((row) => row.some((value) => text(value)));
  const hasSimpleHeaders = firstNonEmpty?.some((value) => ['category', 'planned'].includes(normalized(text(value))));
  if (hasSimpleHeaders) {
    const headers = firstNonEmpty!.map(text);
    const index = rows.indexOf(firstNonEmpty!);
    const records = rows
      .slice(index + 1)
      .map((row) => Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])));
    return parseSimpleBudget(records, submittedName);
  }
  return parseTalousarvio(rows, submittedName);
}
