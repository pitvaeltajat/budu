import Link from 'next/link';

export type Period = { id: string; name: string; startsOn: Date | null; endsOn: Date | null; updatedAt: Date };

/** A budget's own year, which is how people refer to a talousarvio. */
export const periodYear = (period: { startsOn: Date | null }) => period.startsOn?.getUTCFullYear() ?? null;

/**
 * Switches between the imported talousarviot. Plain links rather than a select:
 * both pages are server-rendered, so each period is its own address that can be
 * linked to and opened in a tab, and no client JavaScript is needed to change
 * years.
 *
 * Shared by the dashboard and by /admin, which is the point. Admin used to edit
 * whichever budget was live and nothing else, so a warning about the 2025
 * mapping linked to a page that could only edit 2026 — the one place the fix had
 * to happen was the one place you could not reach.
 */
export function PeriodSwitcher({
  periods,
  selectedId,
  basePath = '/',
}: {
  periods: Period[];
  selectedId: string;
  basePath?: string;
}) {
  if (periods.length < 2) return null;
  return (
    <nav className="periods" aria-label="Talousarviokausi">
      {periods.map((period) => {
        const current = period.id === selectedId;
        const year = periodYear(period);
        // The live period is the bare address; the rest carry their id.
        const href =
          period.id === periods[0]?.id ? basePath : `${basePath}?talousarvio=${encodeURIComponent(period.id)}`;
        return (
          <Link
            key={period.id}
            href={href}
            className={`period${current ? ' period-current' : ''}`}
            aria-current={current ? 'page' : undefined}
            title={period.name}
          >
            {year ?? period.name}
          </Link>
        );
      })}
    </nav>
  );
}
