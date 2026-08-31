'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { takeRecords, flushRecords, type NdjsonBuffer } from '@/lib/ndjson';

/** One line of the sync route's newline-delimited response. */
type SyncEvent =
  | { type: 'running' }
  | { type: 'listed'; listed: number; pending: number }
  | { type: 'progress'; fetched: number; pending: number }
  | { type: 'done'; listed: number; imported: number; pruned: number }
  | { type: 'error'; error: string };

type Progress = { fetched: number; pending: number } | null;

/**
 * Asks for the sync a freshly imported budget still needs, then refreshes the
 * page so the server components re-render with real figures. Rendered only when
 * the budget has no completed sync, so a normal visit costs nothing.
 *
 * The request streams, so the wait is reported as it happens rather than as a
 * spinner that might mean anything. A full sync of this book is well over a
 * thousand voucher reads and takes long enough that "hetken" is not an honest
 * description on its own.
 */
export function KitsasPending({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>(null);

  useEffect(() => {
    // Effects run twice in development; one sync request is enough.
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/kitsas/sync?budgetId=${encodeURIComponent(budgetId)}`, { method: 'POST' });
        if (!response.ok || !response.body) {
          const body = await response.json().catch(() => null);
          if (!cancelled) setError(body?.error || 'Kitsaan haku epäonnistui.');
          return;
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        const buffer: NdjsonBuffer = { rest: '' };
        const handle = (event: SyncEvent) => {
          if (event.type === 'listed' || event.type === 'progress')
            setProgress({ fetched: event.type === 'progress' ? event.fetched : 0, pending: event.pending });
          if (event.type === 'error') setError(event.error);
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (cancelled) return;
          if (done) break;
          for (const event of takeRecords<SyncEvent>(buffer, value)) handle(event);
        }
        for (const event of flushRecords<SyncEvent>(buffer)) handle(event);
        if (cancelled) return;
        // Another tab may already be running the sync; wait it out rather than starting a second.
        setTimeout(() => router.refresh(), 0);
      } catch {
        if (!cancelled) setError('Kitsaan haku epäonnistui.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [budgetId, router]);

  if (error) return <p className="notice">{error}</p>;
  const share = progress && progress.pending > 0 ? progress.fetched / progress.pending : 0;
  return (
    <p className="label pending-note" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> Haetaan toteutuneita kirjauksia Kitsaasta.{' '}
      {progress ? (
        <>
          <strong>
            {progress.fetched}/{progress.pending}
          </strong>{' '}
          tositetta.
          <span className="sync-bar" aria-hidden="true">
            <span className="sync-bar-fill" style={{ width: `${Math.round(share * 100)}%` }} />
          </span>
        </>
      ) : (
        'Tämä kestää hetken.'
      )}
    </p>
  );
}

/** Stand-in for a figure that is still being fetched. */
export function Pending({ wide }: { wide?: boolean }) {
  return <span className={wide ? 'skeleton skeleton-wide' : 'skeleton'} aria-hidden="true" />;
}
