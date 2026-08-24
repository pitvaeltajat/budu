import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { kitsasIsConfigured } from '@/lib/kitsas';
import { syncBudget } from '@/lib/kitsas-sync';

/**
 * Fills a freshly imported budget without holding up the import response. The
 * dashboard opens straight away and calls this while showing its Kitsas-backed
 * figures as pending.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Kirjautuminen vaaditaan.' }, { status: 401 });
  if (!kitsasIsConfigured()) return Response.json({ error: 'Kitsasta ei ole yhdistetty.' }, { status: 409 });
  const requested = new URL(request.url).searchParams.get('budgetId');
  const budget = requested
    ? await prisma.budget.findFirst({ where: { id: requested, createdById: session.user.id }, select: { id: true } })
    : await prisma.budget.findFirst({ where: { createdById: session.user.id }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
  if (!budget) return Response.json({ error: 'Talousarviota ei löytynyt.' }, { status: 404 });
  /** A run already under way is left alone; two syncs of one budget would only race. */
  const running = await prisma.syncRun.findFirst({ where: { budgetId: budget.id, status: 'RUNNING' } });
  if (running) return Response.json({ status: 'running' });
  try {
    return Response.json({ status: 'completed', ...(await syncBudget(budget.id, 'full')) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Kitsaan haku epäonnistui.' }, { status: 502 });
  }
}
