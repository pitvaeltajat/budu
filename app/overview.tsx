import type { ReactNode } from 'react';
import { type Alert, OVERRUN_MARGIN, SHORTFALL_MARGIN, INCOME_SERIOUS_SHARE } from '@/lib/budget-pace';
import { Pending } from './kitsas-pending';
import { CategoryDetail, type CategoryDetailProps } from './category-detail';

/** Six rows fit without the card turning into a second copy of the table. */
const ALERT_LIMIT = 6;

export type Totals = { usedCents: number; plannedCents: number; expectedCents: number };
type Tone = Alert['tone'] | 'good';

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100);

/** Both halves of the budget are judged against pace, never against the calendar alone. */
function expenseTone(totals: Totals): Tone {
  if (totals.plannedCents > 0 && totals.usedCents > totals.plannedCents) return 'over';
  return totals.usedCents > totals.expectedCents * OVERRUN_MARGIN ? 'ahead' : 'good';
}

function incomeTone(totals: Totals): Tone {
  if (totals.plannedCents === 0 || totals.expectedCents === 0) return 'good';
  if (totals.usedCents < totals.expectedCents * INCOME_SERIOUS_SHARE) return 'over';
  return totals.usedCents < totals.expectedCents * SHORTFALL_MARGIN ? 'ahead' : 'good';
}

function badgeLabel(reason: Alert['reason']) {
  switch (reason) {
    case 'over':
      return 'Yli arvion';
    case 'projected-over':
      return 'Menossa yli';
    case 'unbudgeted':
      return 'Ei arviota';
    case 'income-none':
      return 'Ei tuloja';
    case 'income-short':
      return 'Jäljessä';
  }
}

function alertNote(alert: Alert, currency: string) {
  switch (alert.reason) {
    case 'over':
      return `Arvio ylittynyt ${money(alert.usedCents - alert.plannedCents, currency)}.`;
    case 'projected-over':
      return `Tällä vauhdilla vuosi päätyy noin ${money(alert.projectedCents, currency)} eli ${money(alert.projectedCents - alert.plannedCents, currency)} yli arvion.`;
    case 'unbudgeted':
      return `Kirjauksia ${money(alert.usedCents, currency)}, vaikka talousarviossa ei ole varausta.`;
    case 'income-none':
      return `Tähän aikaan vuodesta pitäisi olla kertynyt ${money(alert.expectedCents, currency)}, eikä tuloja ole vielä lainkaan.`;
    case 'income-short':
      return `Tähän aikaan vuodesta pitäisi olla kertynyt ${money(alert.expectedCents, currency)}, kertynyt ${money(alert.usedCents, currency)}.`;
  }
}

/**
 * The state of the budget as a whole, then the lines that have drifted off their
 * own pace. Every bar reads the same way: the fill is what has actually
 * happened, the solid tick is where the line should stand today, and the track
 * ends at the full-year estimate. A fill past the tick is running hot; on the
 * income side a fill short of it is money the association was counting on and
 * has not seen. Both the badge and the sentence under each bar repeat what the
 * colour says, so the state never rests on colour alone.
 */
export function Overview({
  currency,
  awaiting,
  expense,
  income,
  alerts,
  details,
}: {
  currency: string;
  awaiting: boolean;
  expense: Totals;
  income: Totals;
  alerts: Alert[];
  /** Each line's modal, keyed by category, so an alert can open the one it names. */
  details: Record<string, CategoryDetailProps>;
}) {
  if (awaiting)
    return (
      <section className="card overview">
        <div className="section-head">
          <h2>Yleiskuva</h2>
        </div>
        <div className="empty">
          <Pending wide />
        </div>
      </section>
    );
  const shown = alerts.slice(0, ALERT_LIMIT);
  const hidden = alerts.length - shown.length;
  return (
    <section className="card overview">
      <div className="section-head">
        <h2>Yleiskuva</h2>
        <span className="label">kuluva kausi suhteessa arvioon</span>
      </div>
      <div className="overview-totals">
        <MeterRow
          name="Menot"
          tone={expenseTone(expense)}
          totals={expense}
          currency={currency}
          note={`Tähän aikaan vuodesta arvioitu ${money(expense.expectedCents, currency)}.`}
        />
        <MeterRow
          name="Tulot"
          tone={incomeTone(income)}
          totals={income}
          currency={currency}
          note={`Tähän aikaan vuodesta arvioitu ${money(income.expectedCents, currency)}.`}
        />
      </div>
      <p className="meter-legend">
        <span>
          <span className="meter-key" />
          Tavoitetaso tänään
        </span>
        <span>
          <span className="meter-key meter-key-plan" />
          Koko vuoden arvio
        </span>
      </p>
      <h3 className="overview-subhead">Huomiota vaativat kohdat</h3>
      {shown.length ? (
        <>
          <ul className="overview-alerts">
            {shown.map((alert) => (
              <li key={alert.category}>
                <MeterRow
                  /**
                   * The same modal the table opens. An alert names a line and
                   * says it has drifted; the next question is always which
                   * bookings did that, and it was two scrolls away.
                   */
                  name={details[alert.category] ? <CategoryDetail {...details[alert.category]} /> : alert.category}
                  tone={alert.tone}
                  label={badgeLabel(alert.reason)}
                  totals={{
                    usedCents: alert.usedCents,
                    plannedCents: alert.plannedCents,
                    expectedCents: alert.expectedCents,
                  }}
                  currency={currency}
                  note={alertNote(alert, currency)}
                />
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <p className="label">
              Lisäksi {hidden} muuta kohtaa poikkeaa arviostaan; koko lista on alla olevassa taulukossa.
            </p>
          )}
        </>
      ) : (
        <div className="empty">Jokainen kohta on arvionsa mukaisella uralla, eikä yksikään tulo ole jäljessä.</div>
      )}
    </section>
  );
}

function MeterRow({
  name,
  tone,
  label,
  totals,
  currency,
  note,
}: {
  name: ReactNode;
  tone: Tone;
  label?: string;
  totals: Totals;
  currency: string;
  note: string;
}) {
  /** The track runs to whichever is larger, so an overrun stays visible instead of pinning at full. */
  const scale = Math.max(totals.plannedCents, totals.usedCents, totals.expectedCents, 1);
  const pct = (cents: number) => Math.min(100, Math.max(0, (cents / scale) * 100));
  /** A few euros against a five-figure budget would otherwise render as nothing at all. */
  const fill = totals.usedCents > 0 ? Math.max(1.5, pct(totals.usedCents)) : 0;
  return (
    <div className="overview-row">
      <div className="overview-row-head">
        <span className="overview-name">{name}</span>
        {label && <span className={`badge badge-${tone}`}>{label}</span>}
        <span className="overview-figures">
          {money(totals.usedCents, currency)} / {money(totals.plannedCents, currency)}
        </span>
      </div>
      <div className="meter" data-tone={tone}>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${fill}%` }} />
          {totals.plannedCents > 0 && totals.plannedCents < scale && (
            <span className="meter-plan" style={{ left: `${pct(totals.plannedCents)}%` }} />
          )}
          {totals.expectedCents > 0 && <span className="meter-now" style={{ left: `${pct(totals.expectedCents)}%` }} />}
        </div>
      </div>
      <span className="label">{note}</span>
    </div>
  );
}
