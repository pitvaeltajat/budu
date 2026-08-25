/**
 * How much of a booking counts towards a budget line.
 *
 * This is the rule that lets `KitsasEntry` stay free of any budget: it keeps
 * both the debit and the credit column of every entry, and which one counts is
 * decided here, at read time, from the line's current kind. Reclassifying a
 * line between meno and tulo is therefore a change of interpretation and needs
 * no refetch.
 *
 * The opposite column subtracts rather than being ignored. A credit on an
 * expense account is a refund or a correction and genuinely reduces what was
 * spent; the earlier shape dropped those entries outright, which overstated
 * spending on every account that had ever seen a refund.
 *
 * Kept free of imports so it costs nothing to pull into a client component.
 */
export function realizedCents(line: { kind: string }, entry: { debetCents: number; kreditCents: number }) {
  return line.kind === 'INCOME' ? entry.kreditCents - entry.debetCents : entry.debetCents - entry.kreditCents;
}
