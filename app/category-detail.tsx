'use client';

import { useEffect, useRef, useState } from 'react';
import { AttachmentLinks, type AttachmentFile } from './attachment-links';

/**
 * Cumulative spend against the budget line. Cumulative rather than per-voucher
 * because the budget is a ceiling for the whole period: only a running total can
 * be read against it. The prior year is deliberately recessive grey — it is
 * context for the current line, not a peer series.
 */
const CURRENT = '#0d54d9';
const PREVIOUS = '#757f92';

export type CategoryAttachment = AttachmentFile;
export type CategoryItem = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  attachments?: CategoryAttachment[];
};

export type CategoryDetailProps = {
  category: string;
  kind: string;
  account: number | null;
  currency: string;
  plannedCents: number;
  periodStart: string;
  periodEnd: string;
  todayIso: string;
  previousStart: string;
  current: CategoryItem[];
  previous: CategoryItem[];
};

const DAY = 86_400_000;
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);
const moneyExact = (cents: number, currency: string) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'numeric' }).format(new Date(iso));
const fullDate = (iso: string) => new Intl.DateTimeFormat('fi-FI').format(new Date(iso));
const dayOffset = (iso: string, from: string) => Math.round((Date.parse(iso) - Date.parse(from)) / DAY);

/**
 * One point per expense rather than per day, so each booking gets its own dot
 * and can be traced back to its row in the list. Same-day bookings stack into
 * separate steps at the same x, which is what actually happened.
 */
function cumulative(items: CategoryItem[], from: string) {
  let total = 0;
  return [...items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({ day: dayOffset(item.date, from), total: (total += item.amountCents), id: item.id }));
}

export function CategoryDetail(props: CategoryDetailProps) {
  const { category, kind, account, currency, plannedCents, periodStart, periodEnd, todayIso, previousStart } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!activeId) return;
    rowRefs.current.get(activeId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId]);

  const totalDays = Math.max(1, dayOffset(periodEnd, periodStart));
  const currentSeries = cumulative(props.current, periodStart);
  const previousSeries = cumulative(props.previous, previousStart);
  const currentTotal = currentSeries.at(-1)?.total ?? 0;
  const previousTotal = previousSeries.at(-1)?.total ?? 0;
  /** The like-for-like figure, so the tile matching the table's column keeps its meaning. */
  const elapsed = dayOffset(todayIso, periodStart);
  const previousToDate = previousSeries.reduce((total, point) => (point.day <= elapsed ? point.total : total), 0);

  return (
    <>
      <button type="button" className="row-open" onClick={() => setOpen(true)}>
        {category}
      </button>
      <dialog
        ref={dialogRef}
        className="modal"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
      >
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
              <div>
                <span className="label">Arvio</span>
                <strong>{moneyExact(plannedCents, currency)}</strong>
              </div>
              <div>
                <span className="label">Tänä vuonna</span>
                <strong>{moneyExact(currentTotal, currency)}</strong>
              </div>
              <div>
                <span className="label">Viime vuonna samaan aikaan</span>
                <strong>{moneyExact(previousToDate, currency)}</strong>
              </div>
              <div>
                <span className="label">Viime vuosi yhteensä</span>
                <strong>{moneyExact(previousTotal, currency)}</strong>
              </div>
            </div>

            <Chart
              totalDays={totalDays}
              elapsedDays={Math.max(0, Math.min(totalDays, elapsed))}
              plannedCents={plannedCents}
              currency={currency}
              periodStart={periodStart}
              current={currentSeries}
              previous={previousSeries}
              activeId={activeId}
              onActiveChange={setActiveId}
            />

            <h3 className="modal-subhead">Kirjaukset tänä vuonna</h3>
            {props.current.length ? (
              <table>
                <tbody>
                  {props.current.map((item) => (
                    <tr
                      key={item.id}
                      ref={(node) => {
                        if (node) rowRefs.current.set(item.id, node);
                        else rowRefs.current.delete(item.id);
                      }}
                      className={item.id === activeId ? 'is-active' : undefined}
                    >
                      <td>
                        <strong>{item.description}</strong>
                        <br />
                        <span className="label">{fullDate(item.date)}</span>
                        <AttachmentLinks files={item.attachments} />
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

type Point = { day: number; total: number; id: string };

function Chart({
  totalDays,
  elapsedDays,
  plannedCents,
  currency,
  periodStart,
  current,
  previous,
  activeId,
  onActiveChange,
}: {
  totalDays: number;
  elapsedDays: number;
  plannedCents: number;
  currency: string;
  periodStart: string;
  current: Point[];
  previous: Point[];
  activeId: string | null;
  onActiveChange: (id: string | null) => void;
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
  const path = (points: Point[], until: number) => {
    if (!points.length) return '';
    const segments = [`M ${x(0)} ${y(0)}`];
    let last = 0;
    for (const point of points) {
      if (point.day > until) break;
      segments.push(`L ${x(point.day)} ${y(last)}`, `L ${x(point.day)} ${y(point.total)}`);
      last = point.total;
    }
    segments.push(`L ${x(until)} ${y(last)}`);
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
    if (current.length)
      labels.push({ text: 'Nyt', fill: CURRENT, weight: 650, y: y(totalAt(current, elapsedDays)) + 4, anchor: true });
    if (plannedCents > 0)
      labels.push({
        text: 'Arvio',
        fill: 'var(--muted-foreground)',
        weight: 400,
        y: y(plannedCents) + 4,
        anchor: false,
      });
    if (previous.length)
      labels.push({ text: 'Viime v.', fill: PREVIOUS, weight: 400, y: y(previous.at(-1)!.total) + 4, anchor: false });
    /** Keep the current year where it is and push everything else clear of it. */
    for (let i = 1; i < labels.length; i++) {
      for (let j = 0; j < i; j++) {
        if (Math.abs(labels[i].y - labels[j].y) >= 14) continue;
        labels[i].y = labels[i].y >= labels[j].y ? labels[j].y + 14 : labels[j].y - 14;
      }
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
          const day = Math.round(((ratio * width - pad.left) / plotWidth) * totalDays);
          setHover(day);
          /** Snap to a booking only when the pointer is genuinely near one. */
          const tolerance = Math.max(3, Math.round(totalDays / 60));
          let nearest: Point | null = null;
          for (const point of current) {
            if (Math.abs(point.day - day) > tolerance) continue;
            if (!nearest || Math.abs(point.day - day) < Math.abs(nearest.day - day)) nearest = point;
          }
          onActiveChange(nearest ? nearest.id : null);
        }}
        onMouseLeave={() => {
          setHover(null);
          onActiveChange(null);
        }}
      >
        <line
          x1={pad.left}
          y1={pad.top + plotHeight}
          x2={pad.left + plotWidth}
          y2={pad.top + plotHeight}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {plannedCents > 0 && (
          <>
            <line
              x1={pad.left}
              y1={y(plannedCents)}
              x2={pad.left + plotWidth}
              y2={y(plannedCents)}
              stroke="var(--muted-foreground)"
              strokeWidth="2"
              strokeDasharray="2 5"
              strokeLinecap="round"
            />
          </>
        )}
        {previous.length > 0 && (
          <path d={path(previous, totalDays)} fill="none" stroke={PREVIOUS} strokeWidth="2" strokeLinejoin="round" />
        )}
        {current.length > 0 && (
          <path d={path(current, elapsedDays)} fill="none" stroke={CURRENT} strokeWidth="2" strokeLinejoin="round" />
        )}
        {previous.map((point) => (
          <circle
            key={`p-${point.id}`}
            cx={x(point.day)}
            cy={y(point.total)}
            r="2.5"
            fill={PREVIOUS}
            stroke="var(--card)"
            strokeWidth="1.5"
          />
        ))}
        {current
          .filter((point) => point.day <= elapsedDays)
          .map((point) => (
            <circle
              key={`c-${point.id}`}
              cx={x(point.day)}
              cy={y(point.total)}
              r={point.id === activeId ? 5 : 3}
              fill={CURRENT}
              stroke="var(--card)"
              strokeWidth="2"
            />
          ))}
        {endLabels.map((label) => (
          <text
            key={label.text}
            x={pad.left + plotWidth + 8}
            y={label.y}
            fontSize="12"
            fill={label.fill}
            fontWeight={label.weight}
          >
            {label.text}
          </text>
        ))}
        {hoverDay !== null && (
          <>
            <line
              x1={x(hoverDay)}
              y1={pad.top}
              x2={x(hoverDay)}
              y2={pad.top + plotHeight}
              stroke="var(--border)"
              strokeWidth="1"
            />
            <circle
              cx={x(hoverDay)}
              cy={y(totalAt(previous, hoverDay))}
              r="4"
              fill={PREVIOUS}
              stroke="var(--card)"
              strokeWidth="2"
            />
            <circle
              cx={x(hoverDay)}
              cy={y(totalAt(current, hoverDay))}
              r="4"
              fill={CURRENT}
              stroke="var(--card)"
              strokeWidth="2"
            />
          </>
        )}
        {elapsedDays < totalDays && (
          <line
            x1={x(elapsedDays)}
            y1={pad.top}
            x2={x(elapsedDays)}
            y2={pad.top + plotHeight}
            stroke="var(--border)"
            strokeWidth="1"
            strokeDasharray="3 4"
          />
        )}
        <text x={pad.left} y={height - 8} fontSize="12" fill="var(--muted-foreground)">
          {shortDate(periodStart)}
        </text>
        <text x={pad.left + plotWidth} y={height - 8} fontSize="12" fill="var(--muted-foreground)" textAnchor="end">
          {shortDate(dayToDate(totalDays))}
        </text>
      </svg>
      <figcaption className="chart-readout">
        {hoverDay === null ? (
          <span className="label">Vie osoitin kuvaajan päälle nähdäksesi kertymän.</span>
        ) : (
          <>
            <span className="label">{fullDate(dayToDate(hoverDay))}</span>
            <span>
              <span className="swatch" style={{ background: CURRENT }} /> Nyt{' '}
              {money(totalAt(current, hoverDay), currency)}
            </span>
            <span>
              <span className="swatch" style={{ background: PREVIOUS }} /> Viime v.{' '}
              {money(totalAt(previous, hoverDay), currency)}
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
