/**
 * Amounts as they are typed into a form, as opposed to read out of a
 * spreadsheet cell.
 *
 * `euroCents` in budget-import.ts is forgiving on purpose: it strips whatever
 * currency symbols, separators and stray characters an export happens to carry,
 * because a worksheet cell is not under our control. That same forgiveness is
 * wrong for a field a person edits by hand, where it turns "12o0" into a silent
 * zero and quietly wipes a budget line. Typed input is validated first and
 * rejected when it is not an amount.
 *
 * Kept free of imports so it costs nothing to pull into a client component.
 */

/** Cents, or NaN when the text is not an amount. An empty field means zero. */
export function typedEuroCents(value: string) {
  // `\s` already covers the non-breaking and thin spaces that arrive in pasted
  // spreadsheet cells; € is for anyone who types the unit out.
  const cleaned = value.replace(/[\s€]/g, '');
  if (!cleaned) return 0;
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(cleaned)) return NaN;
  return Math.round(Number(cleaned.replace(',', '.')) * 100);
}

/** Cents as a Finnish-looking amount for an editable field: `125050` to `1250,50`. */
export function euroInputValue(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}
