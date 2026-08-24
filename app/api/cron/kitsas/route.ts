import { syncBudget, syncableBudgetIds, type SyncMode, type VoucherCache } from '@/lib/kitsas-sync';
import { kitsasIsConfigured } from '@/lib/kitsas';

/**
 * Cron entry point. Vercel sends `Authorization: Bearer $CRON_SECRET` when that
 * variable is set; without it configured the route stays closed rather than
 * quietly running unauthenticated, since it reaches an external service.
 */
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'CRON_SECRET is not configured.';
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return 'Unauthorized.';
  return null;
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return Response.json({ error: denied }, { status: 401 });
  if (!kitsasIsConfigured()) return Response.json({ error: 'Kitsas has not been configured.' }, { status: 409 });

  const mode: SyncMode = new URL(request.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental';
  const budgetIds = await syncableBudgetIds();
  // One cache for the whole run: every budget reads the same book.
  const cache: VoucherCache = new Map();
  const results = [];
  for (const budgetId of budgetIds) {
    try {
      results.push(await syncBudget(budgetId, mode, cache));
    } catch (error) {
      results.push({ budgetId, mode, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
  return Response.json({ mode, budgets: budgetIds.length, results });
}
