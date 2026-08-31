/**
 * Which of several talousarviot the app treats as the live one. Kept apart from
 * `budget.ts` so it stays plain data logic with no Prisma client behind it, the
 * same way the pace and section rules are — that is what lets it be tested
 * without a database.
 */

export type BudgetPeriod = { startsOn: Date | null; endsOn: Date | null; updatedAt: Date };

/** Whether a budget's own period contains the given day. Both ends are inclusive. */
export function coversToday(budget: { startsOn: Date | null; endsOn: Date | null }, now = new Date()) {
  return Boolean(budget.startsOn && budget.endsOn && budget.startsOn <= now && budget.endsOn >= now);
}

/**
 * Orders budgets the way the app treats them: the live one first, then by
 * period, newest first.
 *
 * The live one is whichever period contains today — *not* simply the most
 * recently uploaded. That distinction did not exist while only the current year
 * was ever imported, but a closed year can be brought in for comparison now, and
 * importing the 2025 talousarvio must not take over everyone's front page just
 * by being the newest upload.
 *
 * `updatedAt` remains the last tiebreak, which keeps budgets carrying no period
 * at all — the simple category/planned import — in a sensible order.
 */
export function activeFirst<T extends BudgetPeriod>(budgets: T[], now = new Date()): T[] {
  return [...budgets].sort((a, b) => {
    const live = Number(coversToday(b, now)) - Number(coversToday(a, now));
    if (live) return live;
    const period = (b.startsOn?.getTime() ?? -Infinity) - (a.startsOn?.getTime() ?? -Infinity);
    if (period) return period;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
}
