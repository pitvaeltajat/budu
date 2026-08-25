/**
 * Pace: where a budget line should stand today, and how far it has drifted from
 * that. The dashboard's overview is built from this, so the judgement lives here
 * as plain data — no formatting, no wording — and the view supplies the Finnish.
 */

export type PaceLine = { category: string; kind: string; plannedCents: number };

export type AlertReason =
  /** Already past its full-year estimate. */
  | 'over'
  /** Still inside the estimate, but the current pace lands beyond it. */
  | 'projected-over'
  /** Spending on a line the budget gave nothing to. */
  | 'unbudgeted'
  /** Income that should have arrived by now and has only partly arrived. */
  | 'income-short'
  /** Income that should have arrived by now and has not arrived at all. */
  | 'income-none';

export type Alert = {
  category: string;
  reason: AlertReason;
  /** `over` is the acted-on state, `ahead` the warning; they match the table's badges. */
  tone: 'over' | 'ahead';
  usedCents: number;
  plannedCents: number;
  expectedCents: number;
  projectedCents: number;
  /** Euros at stake, which is what orders the list — a small line off by 60 % matters less than a large one off by 10 %. */
  impactCents: number;
};

/**
 * Thresholds keep the overview to lines the hallitus would act on: a line is not
 * worth a warning for being a few euros or a few percent off its pace.
 */
export const OVERRUN_MARGIN = 1.05;
export const OVERRUN_FLOOR_CENTS = 5_000;
export const SHORTFALL_MARGIN = 0.9;
export const SHORTFALL_FLOOR_CENTS = 10_000;
export const UNBUDGETED_FLOOR_CENTS = 5_000;
/** Below this share of what should have arrived, an income line is not merely behind. */
export const INCOME_SERIOUS_SHARE = 0.75;

/**
 * How far into its year a line should be by today. Last year's own shape is the
 * baseline whenever there is one: jäsenmaksut, leirimaksut and avustukset land
 * in particular months, so a straight-line expectation would flag half the
 * budget every spring. Elapsed time is the fallback for an account that is new
 * this year. Clamped away from zero so the projection cannot divide by it.
 */
export function paceFraction(priorToDate: number, priorFull: number, elapsedDays: number, totalDays: number) {
  const raw = priorFull > 0 ? priorToDate / priorFull : elapsedDays / totalDays;
  if (!Number.isFinite(raw)) return 1;
  return Math.min(1, Math.max(0.02, raw));
}

export type PaceInput = {
  lines: PaceLine[];
  usedByCategory: Map<string, number>;
  priorByCategory: Map<string, number>;
  priorFullByCategory: Map<string, number>;
  elapsedDays: number;
  totalDays: number;
};

export type PaceSummary = {
  /** Worst first, measured in euros rather than percentages. */
  alerts: Alert[];
  expectedExpenseCents: number;
  expectedIncomeCents: number;
};

export function summarisePace({
  lines,
  usedByCategory,
  priorByCategory,
  priorFullByCategory,
  elapsedDays,
  totalDays,
}: PaceInput): PaceSummary {
  const alerts: Alert[] = [];
  let expectedExpenseCents = 0;
  let expectedIncomeCents = 0;

  for (const line of lines) {
    const used = usedByCategory.get(line.category) || 0;
    const pace = paceFraction(
      priorByCategory.get(line.category) || 0,
      priorFullByCategory.get(line.category) || 0,
      elapsedDays,
      totalDays,
    );
    const expectedCents = Math.round(line.plannedCents * pace);
    const projectedCents = Math.round(used / pace);
    const shared = {
      category: line.category,
      usedCents: used,
      plannedCents: line.plannedCents,
      expectedCents,
      projectedCents,
    };

    if (line.kind === 'INCOME') {
      expectedIncomeCents += expectedCents;
      const shortfall = expectedCents - used;
      if (line.plannedCents > 0 && used < expectedCents * SHORTFALL_MARGIN && shortfall >= SHORTFALL_FLOOR_CENTS)
        alerts.push({
          ...shared,
          reason: used === 0 ? 'income-none' : 'income-short',
          tone: used < expectedCents * INCOME_SERIOUS_SHARE ? 'over' : 'ahead',
          impactCents: shortfall,
        });
      continue;
    }

    expectedExpenseCents += expectedCents;
    if (line.plannedCents === 0) {
      if (used >= UNBUDGETED_FLOOR_CENTS)
        alerts.push({ ...shared, reason: 'unbudgeted', tone: 'ahead', impactCents: used });
    } else if (used > line.plannedCents) {
      alerts.push({ ...shared, reason: 'over', tone: 'over', impactCents: used - line.plannedCents });
    } else if (
      projectedCents > line.plannedCents * OVERRUN_MARGIN &&
      projectedCents - line.plannedCents >= OVERRUN_FLOOR_CENTS
    ) {
      alerts.push({
        ...shared,
        reason: 'projected-over',
        tone: 'ahead',
        impactCents: projectedCents - line.plannedCents,
      });
    }
  }

  alerts.sort((a, b) => b.impactCents - a.impactCents);
  return { alerts, expectedExpenseCents, expectedIncomeCents };
}
