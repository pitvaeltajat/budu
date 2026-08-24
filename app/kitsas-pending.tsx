'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Asks for the sync a freshly imported budget still needs, then refreshes the
 * page so the server components re-render with real figures. Rendered only when
 * the budget has no completed sync, so a normal visit costs nothing.
 */
export function KitsasPending({ budgetId }: { budgetId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Effects run twice in development; one sync request is enough.
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/kitsas/sync?budgetId=${encodeURIComponent(budgetId)}`, { method: 'POST' });
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) { setError(body?.error || 'Kitsaan haku epäonnistui.'); return; }
        // Another tab may already be running the sync; wait it out rather than starting a second.
        if (body?.status === 'running') { setTimeout(() => router.refresh(), 4000); return; }
        router.refresh();
      } catch {
        if (!cancelled) setError('Kitsaan haku epäonnistui.');
      }
    })();
    return () => { cancelled = true; };
  }, [budgetId, router]);

  if (error) return <p className="notice">{error}</p>;
  return (
    <p className="label pending-note" role="status">
      <span className="spinner" aria-hidden="true" /> Haetaan toteutuneita kirjauksia Kitsaasta. Tämä kestää hetken.
    </p>
  );
}

/** Stand-in for a figure that is still being fetched. */
export function Pending({ wide }: { wide?: boolean }) {
  return <span className={wide ? 'skeleton skeleton-wide' : 'skeleton'} aria-hidden="true" />;
}
