import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { activeFirst } from '@/lib/budget-period';

export { activeFirst, coversToday, type BudgetPeriod } from '@/lib/budget-period';

/**
 * Budu shows one talousarvio at a time, and every signed-in user sees that same
 * one. Nothing here scopes by user: sign-in is already restricted to the
 * organisation's Google Workspace domain, so a valid session *is* the
 * membership check. Scoping reads by importer only had the effect of hiding the
 * shared budget from everyone who had not personally uploaded it, which reads
 * as an empty app rather than as a permission being missing.
 *
 * Only an import or an admin edit moves `updatedAt`; a Kitsas sync writes
 * entries, sync runs and voucher state but never the budget row, so the live
 * budget cannot change underneath a reader on the nightly cron.
 *
 * Which of several budgets is the live one is `activeFirst` in budget-period.ts;
 * this ordering is only its last tiebreak.
 */
export const activeBudgetOrder = { updatedAt: 'desc' } satisfies Prisma.BudgetOrderByWithRelationInput;

/** Id of the live talousarvio, or null when none has been imported yet. */
export async function activeBudgetId() {
  const budgets = await prisma.budget.findMany({
    orderBy: activeBudgetOrder,
    select: { id: true, startsOn: true, endsOn: true, updatedAt: true },
  });
  return activeFirst(budgets)[0]?.id ?? null;
}
