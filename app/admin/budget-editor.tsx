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

type Draft = { amount: string; kind: string; account: string };

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
  live,
  lines,
}: {
  budgetId: string;
  name: string;
  currency: string;
  period: string | null;
  /** Whether this is the period covering today, which is the one the dashboard opens on. */
  live: boolean;
  lines: EditorLine[];
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(saveBudget, {});
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        {
          amount: euroInputValue(line.plannedCents),
          kind: line.kind,
          account: line.kitsasAccount === null ? '' : String(line.kitsasAccount),
        },
      ]),
    ),
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
  const accountOf = (draft: Draft) => draft.account.trim();
  const changed = lines.filter((line) => {
    const draft = drafts[line.id];
    return (
      draft.kind !== line.kind ||
      typedEuroCents(draft.amount) !== line.plannedCents ||
      accountOf(draft) !== (line.kitsasAccount === null ? '' : String(line.kitsasAccount))
    );
  }).length;
  /**
   * Two rows on one account is refused by the server; catching it here means the
   * offending rows are marked while they are still on screen, rather than the
   * whole save bouncing with a sentence about a row you have to go and find.
   */
  const duplicated = new Set(
    lines
      .map((line) => accountOf(drafts[line.id]))
      .filter(Boolean)
      .filter((account, index, all) => all.indexOf(account) !== index),
  );

  return (
    <form action={formAction} className="card admin-block">
      <div className="section-head">
        <h2>{live ? 'Nykyinen talousarvio' : name}</h2>
        <span className="label">
          {live ? '' : 'päättynyt kausi · '}
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
            <th className="admin-account-column">Kitsas-tili</th>
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
                    <th colSpan={4} scope="colgroup">
                      {heading}
                    </th>
                  </tr>
                )}
                <tr>
                  <td>
                    <label htmlFor={`amount-${line.id}`}>{line.category}</label>
                    <br />
                    <span className="label">
                      {accountOf(draft) === (line.kitsasAccount === null ? '' : String(line.kitsasAccount))
                        ? line.kitsasAccount
                          ? `tili ${line.kitsasAccount}`
                          : 'ei Kitsas-tiliä'
                        : `tili ${line.kitsasAccount ?? '–'} → ${accountOf(draft) || '–'}`}
                      {draft.kind !== line.kind && ' · laji muuttuu'}
                    </span>
                  </td>
                  <td className="admin-account-column">
                    <input
                      className={duplicated.has(accountOf(draft)) ? 'account-input is-invalid' : 'account-input'}
                      aria-label={`${line.category}: Kitsas-tili`}
                      aria-invalid={duplicated.has(accountOf(draft))}
                      name={`account:${line.id}`}
                      inputMode="numeric"
                      placeholder="—"
                      value={draft.account}
                      onChange={(event) => set(line.id, { account: event.target.value })}
                    />
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
        <button className="button" disabled={pending || totals.invalid > 0 || duplicated.size > 0}>
          {pending ? 'Tallennetaan…' : 'Tallenna muutokset'}
        </button>
      </div>

      {duplicated.size > 0 && (
        <p className="notice" role="alert">
          Sama Kitsas-tili on useammalla rivillä: {[...duplicated].join(', ')}. Tili voi kuulua vain yhdelle riville,
          muuten sen kirjaukset päätyisivät vain toiselle niistä.
        </p>
      )}
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
