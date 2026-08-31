/**
 * Groups budget rows into the sections the sheet is read in, and totals each.
 *
 * Sections are runs of consecutive rows sharing a `groupName`, not a lookup:
 * the rows already arrive in section order from `lib/budget-sections.ts`, and
 * grouping consecutively keeps the table's order and its headings the same
 * thing rather than two orders that can disagree.
 *
 * A section is totalled **per kind**. Several of them hold both tuotot and
 * kulut — "Satunnaiset erät" spans 7000–7199 and 8825, "Kammin tuotot ja kulut"
 * spans 3500–3599 and 4500–4599 — and one number adding income to expenditure
 * would not mean anything. Sections that hold a single kind get a single total,
 * which is the common case.
 */

export type GroupableLine = { category: string; groupName: string | null; kind: string; plannedCents: number };

export type SectionTotal = {
  kind: string;
  rows: number;
  plannedCents: number;
  usedCents: number;
  priorCents: number;
};

export type Section<T> = { name: string | null; lines: T[]; totals: SectionTotal[] };

/**
 * `used` and `prior` are keyed by category, which is how the dashboard already
 * holds its realized figures; a row missing from them has simply had nothing
 * booked to it.
 */
export function sectionsOf<T extends GroupableLine>(
  lines: T[],
  used: Map<string, number>,
  prior: Map<string, number>,
): Section<T>[] {
  const sections: Section<T>[] = [];
  for (const line of lines) {
    let section = sections.at(-1);
    if (!section || section.name !== line.groupName) {
      section = { name: line.groupName, lines: [], totals: [] };
      sections.push(section);
    }
    section.lines.push(line);
    // Kinds keep the order they first appear in, so the totals read down the
    // section the same way the rows above them do.
    let total = section.totals.find((candidate) => candidate.kind === line.kind);
    if (!total) {
      total = { kind: line.kind, rows: 0, plannedCents: 0, usedCents: 0, priorCents: 0 };
      section.totals.push(total);
    }
    total.rows += 1;
    total.plannedCents += line.plannedCents;
    total.usedCents += used.get(line.category) ?? 0;
    total.priorCents += prior.get(line.category) ?? 0;
  }
  return sections;
}

/**
 * Whether a section is worth a subtotal row at all. A single row is its own
 * total, and repeating it underneath itself is noise in a table that already
 * runs to a hundred lines.
 */
export function worthTotalling(section: Section<GroupableLine>) {
  return section.lines.length > 1;
}
