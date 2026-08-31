/**
 * Rules for the one field that decides whether a talousarvio row sees any money
 * at all: its Kitsas account number.
 *
 * Kept apart from the server action so it is plain logic with no Prisma or
 * `use server` behind it, and can be tested without a database.
 */

/** Distinguishes "clear the mapping" (null) from "that is not an account" (this). */
export const INVALID_ACCOUNT = Symbol('invalid account');

/**
 * A Kitsas account number, or null when the row is deliberately unmapped.
 *
 * Blank means unmapped rather than invalid: a talousarvio row with no
 * counterpart in the book is a normal thing to have, and refusing it would push
 * people into inventing an account number to get past the form.
 */
export function parseAccount(raw: string): number | null | typeof INVALID_ACCOUNT {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d{1,6}$/.test(trimmed)) return INVALID_ACCOUNT;
  const account = Number(trimmed);
  return Number.isSafeInteger(account) && account > 0 ? account : INVALID_ACCOUNT;
}

/**
 * Accounts claimed by more than one row.
 *
 * Two rows on one account is not a double count — it is a silent loss. The
 * dashboard joins a booking to its row through a map keyed by account number,
 * so the second row to claim an account simply replaces the first and one of
 * them stops receiving anything, with nothing on screen to say so.
 */
export function duplicateAccounts(mapped: (number | null)[]): number[] {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const account of mapped) {
    if (account === null) continue;
    if (seen.has(account)) duplicates.add(account);
    seen.add(account);
  }
  return [...duplicates].sort((a, b) => a - b);
}
