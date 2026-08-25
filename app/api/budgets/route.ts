import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetOrder } from '@/lib/budget';

/**
 * Lists every budget, newest first, with enough detail to tell them apart. The
 * first entry is the active one. Budgets are shared across the organisation, so
 * this is not scoped to the caller; see lib/budget.ts.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Kirjautuminen vaaditaan.' }, { status: 401 });
  const budgets = await prisma.budget.findMany({
    orderBy: activeBudgetOrder,
    select: {
      id: true,
      name: true,
      startsOn: true,
      endsOn: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { lines: true } },
    },
  });
  return Response.json({ budgets });
}
