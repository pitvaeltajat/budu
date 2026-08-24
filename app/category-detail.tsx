'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Cumulative spend against the budget line. Cumulative rather than per-voucher
 * because the budget is a ceiling for the whole period: only a running total can
 * be read against it. The prior year is deliberately recessive grey — it is
 * context for the current line, not a peer series.
 */
const CURRENT = '#0d54d9';
const PREVIOUS = '#757f92';

export type CategoryItem = { id: string; date: string; description: string; amountCents: number };

export type CategoryDetailProps = {
  category: string;
  kind: string;
  account: number | null;
  currency: string;
  plannedCents: number;
  periodStart: string;
  periodEnd: string;
  previousStart: string;
  current: CategoryItem[];
  previous: CategoryItem[];
};

const DAY = 86_400_000;
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
const moneyExact = (cents: number, currency: string) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
const shortDate = (iso: string) => new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric' }).format(new Date(iso));
const fullDate = (iso: string) => new Intl.DateTimeFormat('fi-FI').format(new Date(iso));
const dayOffset = (iso: string, from: string) => Math.round((Date.parse(iso) - Date.parse(from)) / DAY);

/** Running total by day offset, so both years share one x scale. */
function cumulative(items: CategoryItem[], from: string) {
  const byDay = new Map<number, number>();
  for (const item of items) {
    const day = dayOffset(item.date, from);
    byDay.set(day, (byDay.get(day) || 0) + item.amountCents);
  }
  let total = 0;
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, amount]) => ({ day, total: (total += amount) }));
}

export function CategoryDetail(props: CategoryDetailProps) {
  const { category, kind, account, currency, plannedCents, periodStart, periodEnd, previousStart } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const totalDays = Math.max(1, dayOffset(periodEnd, periodStart));
  const currentSeries = cumulative(props.current, periodStart);
  const previousSeries = cumulative(props.previous, previousStart);
  const currentTotal = currentSeries.at(-1)?.total ?? 0;
  const previousTotal = previousSeries.at(-1)?.total ?? 0;

  return (
    <>
      <button type="button" className="row-open" onClick={() => setOpen(true)}>
        {category}
      </button>
      <dialog ref={dialogRef} className="modal" onClose={() => setOpen(false)}>
        {open && (
          <div className="modal-body">
            <div className="section-head">
              <div>
                <h2>{category}</h2>
                <span className="label">
                  {kind === 'INCOME' ? 'Tulo' : 'Meno'}
                  {account ? ` · tili ${account}` : ''}
                </span>
              </div>
              <button type="button" className="link-button" onClick={() => setOpen(false)}>
                Sulje
              </button>
            </div>

            <div className="modal-summary">
              <div><span className="label">Arvio</span><strong>{moneyExact(plannedCents, currency)}</strong></div>
              <div><span className="label">Tänä vuonna</span><strong>{moneyExact(currentTotal, currency)}</strong></div>
              <div><span className="label">Viime vuonna</span><strong>{moneyExact(previousTotal, currency)}</strong></div>
            </div>

            <Chart
              totalDays={totalDays}
              plannedCents={plannedCents}
              currency={currency}
              periodStart={periodStart}
              current={currentSeries}
              previous={previousSeries}
            />

            <h3 className="modal-subhead">Kirjaukset tänä vuonna</h3>
            {props.current.length ? (
              <table>
                <tbody>
                  {props.current.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.description}</strong>
                        <br />
                        <span className="label">{fullDate(item.date)}</span>
                      </td>
                      <td className="right">{moneyExact(item.amountCents, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty">Tälle kohdalle ei ole vielä kirjauksia kuluvalta kaudelta.</div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}

type Point = { day: number; total: number };

function Chart({
  totalDays,
  plannedCents,
  currency,
  periodStart,
  current,
  previous,
}: {
  totalDays: number;
  plannedCents: number;
  currency: string;
  periodStart: string;
  current: Point[];
  previous: Point[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 680;
  const height = 260;
  const pad = { top: 16, right: 76, bottom: 28, left: 8 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const peak = Math.max(plannedCents, current.at(-1)?.total ?? 0, previous.at(-1)?.total ?? 0, 1);
  const yMax = peak * 1.12;
  const x = (day: number) => pad.left + (Math.min(day, totalDays) / totalDays) * plotWidth;
  const y = (cents: number) => pad.top + plotHeight - (cents / yMax) * plotHeight;

  /** Spending jumps on the day a voucher lands, so the line steps rather than slopes. */
  const path = (points: Point[]) => {
    if (!points.length) return '';
    const segments = [`M ${x(0)} ${y(0)}`];
    let last = 0;
    for (const point of points) {
      segments.push(`L ${x(point.day)} ${y(last)}`, `L ${x(point.day)} ${y(point.total)}`);
      last = point.total;
    }
    segments.push(`L ${x(totalDays)} ${y(last)}`);
    return segments.join(' ');
  };
  const totalAt = (points: Point[], day: number) => {
    let total = 0;
    for (const point of points) if (point.day <= day) total = point.total;
    return total;
  };
  const dayToDate = (day: number) => new Date(Date.parse(periodStart) + day * DAY).toISOString().slice(0, 10);

  const hoverDay = hover === null ? null : Math.max(0, Math.min(totalDays, hover));

  /**
   * Both series can finish within a few euros of each other, which stacks the end
   * labels on top of one another. Push them apart when they are closer than a
   * line height, keeping the current year in place because it is the one being read.
   */
  const endLabels = (() => {
    const labels = [];
    if (current.length) labels.push({ text: 'Nyt', fill: CURRENT, weight: 650, y: y(current.at(-1)!.total) + 4, anchor: true });
    if (previous.length) labels.push({ text: 'Viime v.', fill: PREVIOUS, weight: 400, y: y(previous.at(-1)!.total) + 4, anchor: false });
    if (labels.length === 2 && Math.abs(labels[0].y - labels[1].y) < 14) {
      const other = labels[1];
      other.y = other.y >= labels[0].y ? labels[0].y + 14 : labels[0].y - 14;
    }
    return labels.map((label) => ({ ...label, y: Math.max(pad.top + 8, Math.min(pad.top + plotHeight, label.y)) }));
  })();

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Kertymä kuluvalla kaudella verrattuna arvioon ja viime vuoteen"
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHover(Math.round(((ratio * width - pad.left) / plotWidth) * totalDays));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={pad.left} y1={pad.top + plotHeight} x2={pad.left + plotWidth} y2={pad.top + plotHeight} stroke="var(--border)" strokeWidth="1" />
        {plannedCents > 0 && (
          <>
            <line x1={pad.left} y1={y(plannedCents)} x2={pad.left + plotWidth} y2={y(plannedCents)} stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
            <text x={pad.left + plotWidth + 8} y={y(plannedCents) + 4} fontSize="12" fill="var(--muted-foreground)">Arvio</text>
          </>
        )}
        {previous.length > 0 && <path d={path(previous)} fill="none" stroke={PREVIOUS} strokeWidth="2" strokeLinejoin="round" />}
        {current.length > 0 && <path d={path(current)} fill="none" stroke={CURRENT} strokeWidth="2" strokeLinejoin="round" />}
        {endLabels.map((label) => (
          <text key={label.text} x={pad.left + plotWidth + 8} y={label.y} fontSize="12" fill={label.fill} fontWeight={label.weight}>
            {label.text}
          </text>
        ))}
        {hoverDay !== null && (
          <>
            <line x1={x(hoverDay)} y1={pad.top} x2={x(hoverDay)} y2={pad.top + plotHeight} stroke="var(--border)" strokeWidth="1" />
            <circle cx={x(hoverDay)} cy={y(totalAt(previous, hoverDay))} r="4" fill={PREVIOUS} stroke="var(--card)" strokeWidth="2" />
            <circle cx={x(hoverDay)} cy={y(totalAt(current, hoverDay))} r="4" fill={CURRENT} stroke="var(--card)" strokeWidth="2" />
          </>
        )}
        <text x={pad.left} y={height - 8} fontSize="12" fill="var(--muted-foreground)">{shortDate(periodStart)}</text>
        <text x={pad.left + plotWidth} y={height - 8} fontSize="12" fill="var(--muted-foreground)" textAnchor="end">{shortDate(dayToDate(totalDays))}</text>
      </svg>
      <figcaption className="chart-readout">
        {hoverDay === null ? (
          <span className="label">Vie osoitin kuvaajan päälle nähdäksesi kertymän.</span>
        ) : (
          <>
            <span className="label">{fullDate(dayToDate(hoverDay))}</span>
            <span><span className="swatch" style={{ background: CURRENT }} /> Nyt {money(totalAt(current, hoverDay), currency)}</span>
            <span><span className="swatch" style={{ background: PREVIOUS }} /> Viime v. {money(totalAt(previous, hoverDay), currency)}</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
