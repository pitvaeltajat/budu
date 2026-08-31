import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetId } from '@/lib/budget';
import { kitsasIsConfigured } from '@/lib/kitsas';
import { syncBudget, type SyncProgress } from '@/lib/kitsas-sync';

/**
 * Fills a freshly imported budget without holding up the import response. The
 * dashboard opens straight away and calls this while showing its Kitsas-backed
 * figures as pending.
 *
 * The response is newline-delimited JSON rather than a single object: a full
 * sync of the association's book is well over a thousand voucher reads, and a
 * request that says nothing for a minute is indistinguishable from one that has
 * hung. Each line is one event, so the page can count vouchers as they land.
 */
export const maxDuration = 300;

/**
 * Progress is throttled by time, not by count. A book of a few hundred vouchers
 * and one of several thousand should both feel steady, and neither should spend
 * the sync writing a line per voucher into the response.
 */
const PROGRESS_INTERVAL_MS = 200;

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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The reader went away — the sync itself carries on to completion.
        }
      };
      if (running) {
        send({ type: 'running' });
        controller.close();
        return;
      }
      let lastSentAt = 0;
      try {
        const outcome = await syncBudget(budgetId, 'full', undefined, (progress: SyncProgress) => {
          const now = Date.now();
          if (progress.type === 'progress' && now - lastSentAt < PROGRESS_INTERVAL_MS) return;
          lastSentAt = now;
          send(progress);
        });
        send({ type: 'done', ...outcome });
      } catch (error) {
        /**
         * The status line has long since been sent, so a failure here cannot be
         * an HTTP error. It is an event like any other, and the page reads it
         * as one.
         */
        send({ type: 'error', error: error instanceof Error ? error.message : 'Kitsaan haku epäonnistui.' });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
    },
  });
}
