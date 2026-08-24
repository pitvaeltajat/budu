import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** Lists the caller's own budgets, newest first, with enough detail to tell them apart. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Kirjautuminen vaaditaan.' }, { status: 401 });
  const budgets = await prisma.budget.findMany({
    where: { createdById: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, startsOn: true, endsOn: true, createdAt: true, updatedAt: true,
      _count: { select: { lines: true, expenses: true } },
    },
  });
  return Response.json({ budgets });
}
