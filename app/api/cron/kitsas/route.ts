import { syncAllBudgets, type SyncMode } from '@/lib/kitsas-sync';
import { kitsasIsConfigured } from '@/lib/kitsas';

/**
 * Cron entry point. Vercel sends `Authorization: Bearer $CRON_SECRET` when that
 * variable is set; without it configured the route stays closed rather than
 * quietly running unauthenticated, since it reaches an external service.
 */
export const maxDuration = 300;

function authorize(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'CRON_SECRET puuttuu asetuksista.';
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return 'Unauthorized.';
  return null;
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return Response.json({ error: denied }, { status: 401 });
  if (!kitsasIsConfigured()) return Response.json({ error: 'Kitsasta ei ole yhdistetty.' }, { status: 409 });

  /** Incremental unless asked otherwise; the schedule decides which runs when. */
  const mode: SyncMode = new URL(request.url).searchParams.get('mode') === 'full' ? 'full' : 'incremental';
  return Response.json(await syncAllBudgets(mode));
}
