'use client';

import { Fragment, useActionState, useState } from 'react';
import { euroInputValue, typedEuroCents } from '@/lib/euro';
import { saveBudget, type AdminState } from './actions';

export type EditorLine = {
  id: string;
  category: string;
  groupName: string | null;
  kitsasAccount: number | null;
  plannedCents: number;
  kind: string;
};

type Draft = { amount: string; kind: string };

/**
 * The rows are edited in place rather than one dialog at a time: correcting a
 * budget usually means walking down the whole sheet, and the totals only mean
 * something when every row is in view. Inputs are controlled so those totals
 * can follow the typing; the submitted values are still read from the form, so
 * the server never trusts what the client computed.
 */
export function BudgetEditor({
  budgetId,
  name,
  currency,
  period,
  lines,
}: {
  budgetId: string;
  name: string;
  currency: string;
  period: string | null;
  lines: EditorLine[];
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(saveBudget, {});
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, { amount: euroInputValue(line.plannedCents), kind: line.kind }])),
  );

  const money = (cents: number) => new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
  const set = (id: string, patch: Partial<Draft>) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const totals = lines.reduce(
    (sums, line) => {
      const draft = drafts[line.id];
      const cents = typedEuroCents(draft.amount);
      if (!Number.isFinite(cents)) return { ...sums, invalid: sums.invalid + 1 };
      if (draft.kind === 'INCOME') return { ...sums, income: sums.income + cents };
      return { ...sums, expense: sums.expense + cents };
    },
    { expense: 0, income: 0, invalid: 0 },
  );
  const changed = lines.filter((line) => {
    const draft = drafts[line.id];
    return draft.kind !== line.kind || typedEuroCents(draft.amount) !== line.plannedCents;
  }).length;

  return (
    <form action={formAction} className="card admin-block">
      <div className="section-head">
        <h2>Nykyinen talousarvio</h2>
        <span className="label">
          {period ?? 'Kausi ei tiedossa'} · {lines.length} riviä
        </span>
      </div>

      <input type="hidden" name="budgetId" value={budgetId} />
      <div className="form-row">
        <label htmlFor="budget-name">Nimi</label>
        <input id="budget-name" name="name" defaultValue={name} required />
      </div>

      <table className="editor-table">
        <thead>
          <tr>
            <th>Kohta</th>
            <th className="admin-kind-column">Laji</th>
            <th className="right admin-amount-column">Arvio ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => {
            const draft = drafts[line.id];
            const invalid = !Number.isFinite(typedEuroCents(draft.amount));
            const heading = line.groupName && line.groupName !== lines[index - 1]?.groupName ? line.groupName : null;
            return (
              <Fragment key={line.id}>
                {heading && (
                  <tr className="group-row">
                    <th colSpan={3} scope="colgroup">
                      {heading}
                    </th>
                  </tr>
                )}
                <tr>
                  <td>
                    <label htmlFor={`amount-${line.id}`}>{line.category}</label>
                    <br />
                    <span className="label">
                      {line.kitsasAccount ? `tili ${line.kitsasAccount}` : 'ei Kitsas-tiliä'}
                      {draft.kind !== line.kind && ' · laji muuttuu'}
                    </span>
                  </td>
                  <td className="admin-kind-column">
                    <select
                      aria-label={`${line.category}: laji`}
                      name={`kind:${line.id}`}
                      value={draft.kind}
                      onChange={(event) => set(line.id, { kind: event.target.value })}
                    >
                      <option value="EXPENSE">Meno</option>
                      <option value="INCOME">Tulo</option>
                    </select>
                  </td>
                  <td className="right admin-amount-column">
                    <input
                      id={`amount-${line.id}`}
                      className={invalid ? 'amount-input is-invalid' : 'amount-input'}
                      name={`amount:${line.id}`}
                      inputMode="decimal"
                      aria-invalid={invalid}
                      value={draft.amount}
                      onChange={(event) => set(line.id, { amount: event.target.value })}
                    />
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="editor-footer">
        <div className="editor-totals">
          <span className="label">
            Menoarvio <strong>{money(totals.expense)}</strong>
          </span>
          <span className="label">
            Tuloarvio <strong>{money(totals.income)}</strong>
          </span>
          <span className="label">{changed === 0 ? 'Ei muutoksia' : `${changed} muutettua riviä`}</span>
        </div>
        <button className="button" disabled={pending || totals.invalid > 0}>
          {pending ? 'Tallennetaan…' : 'Tallenna muutokset'}
        </button>
      </div>

      {totals.invalid > 0 && (
        <p className="notice">
          Tarkista {totals.invalid === 1 ? 'korostettu summa' : `${totals.invalid} korostettua summaa`}. Käytä muotoa
          1250,50.
        </p>
      )}
      {state.error && (
        <p className="notice" role="alert">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="label" role="status">
          {state.ok}
        </p>
      )}
    </form>
  );
}
