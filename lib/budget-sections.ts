/**
 * The association's budget has a fixed shape, so section names are defined here
 * rather than read from whatever headings a spreadsheet happens to carry. The
 * Kitsas account number is the single source of truth: it decides which section
 * a row belongs to, in what order sections appear, and how a budget line joins
 * to a voucher entry.
 *
 * Ranges are stated per section and must not overlap; `assertNoOverlap` is
 * exercised by the tests. Order here is display order.
 */
export type BudgetSection = { name: string; ranges: [number, number][] };

export const BUDGET_SECTIONS: BudgetSection[] = [
  { name: 'Varsinaisen toiminnan tuotot', ranges: [[3000, 3499]] },
  {
    name: 'Varsinaisen toiminnan kulut',
    ranges: [
      [4200, 4399],
      [4800, 4899],
    ],
  },
  { name: 'Hallintokulut', ranges: [[4900, 4999]] },
  { name: 'Poistot', ranges: [[8000, 8099]] },
  { name: 'Toimitilakulut', ranges: [[4400, 4499]] },
  { name: 'Kone- ja kalustokulut', ranges: [[4600, 4699]] },
  {
    name: 'Kammin tuotot ja kulut',
    ranges: [
      [3500, 3599],
      [4500, 4599],
    ],
  },
  { name: 'Varainhankinnan tuotot', ranges: [[5000, 5099]] },
  { name: 'Varainhankinnan kulut', ranges: [[5100, 5199]] },
  { name: 'Sijoitus- ja rahoitustoiminnan tuotot', ranges: [[6000, 6099]] },
  { name: 'Sijoitus- ja rahoitustoiminnan kulut', ranges: [[6100, 6199]] },
  {
    name: 'Satunnaiset erät',
    ranges: [
      [7000, 7199],
      [8825, 8825],
    ],
  },
  { name: 'Avustukset', ranges: [[7500, 7599]] },
];

/** Accounts outside every stated range still have to appear somewhere. */
export const OTHER_SECTION = 'Muut erät';

export function sectionIndexForAccount(account: number) {
  return BUDGET_SECTIONS.findIndex((section) => section.ranges.some(([from, to]) => account >= from && account <= to));
}

export function sectionForAccount(account: number) {
  const index = sectionIndexForAccount(account);
  return index === -1 ? OTHER_SECTION : BUDGET_SECTIONS[index].name;
}

/** Sort key placing unrecognised accounts after every named section. */
export function sectionSortKey(account: number) {
  const index = sectionIndexForAccount(account);
  return index === -1 ? BUDGET_SECTIONS.length : index;
}

export function assertNoOverlap() {
  const seen: { name: string; from: number; to: number }[] = [];
  for (const section of BUDGET_SECTIONS) {
    for (const [from, to] of section.ranges) {
      if (from > to) throw new Error(`${section.name}: range ${from}-${to} is inverted.`);
      const clash = seen.find((range) => from <= range.to && to >= range.from);
      if (clash) throw new Error(`${section.name} ${from}-${to} overlaps ${clash.name} ${clash.from}-${clash.to}.`);
      seen.push({ name: section.name, from, to });
    }
  }
  return true;
}
