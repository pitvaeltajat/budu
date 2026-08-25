import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Budu tracks one talousarvio at a time, and every signed-in user sees that
 * same one. Nothing here scopes by user: sign-in is already restricted to the
 * organisation's Google Workspace domain, so a valid session *is* the
 * membership check. Scoping reads by importer only had the effect of hiding the
 * shared budget from everyone who had not personally uploaded it, which reads
 * as an empty app rather than as a permission being missing.
 *
 * Newest wins. Only an import or an admin edit moves `updatedAt`; a Kitsas sync
 * writes entries, sync runs and voucher state but never the budget row, so the
 * active budget cannot change underneath a reader on the nightly cron.
 */
export const activeBudgetOrder = { updatedAt: 'desc' } satisfies Prisma.BudgetOrderByWithRelationInput;

/** Id of the active talousarvio, or null when none has been imported yet. */
export async function activeBudgetId() {
  const budget = await prisma.budget.findFirst({ orderBy: activeBudgetOrder, select: { id: true } });
  return budget?.id ?? null;
}
