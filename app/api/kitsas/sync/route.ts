import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetId } from '@/lib/budget';
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
  /**
   * Copying realized bookings in from Kitsas is a read, not a change to the
   * talousarvio, so this stays open to any signed-in user rather than to admins
   * alone: whoever opens a dashboard that is still pending should be able to
   * fill it. Kitsas itself is only ever read; see the safety contract.
   */
  const budgetId = requested
    ? ((await prisma.budget.findUnique({ where: { id: requested }, select: { id: true } }))?.id ?? null)
    : await activeBudgetId();
  if (!budgetId) return Response.json({ error: 'Talousarviota ei löytynyt.' }, { status: 404 });
  /** A run already under way is left alone; two syncs of one budget would only race. */
  const running = await prisma.syncRun.findFirst({ where: { budgetId, status: 'RUNNING' } });
  if (running) return Response.json({ status: 'running' });
  try {
    return Response.json({ status: 'completed', ...(await syncBudget(budgetId, 'full')) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Kitsaan haku epäonnistui.' },
      { status: 502 },
    );
  }
}
