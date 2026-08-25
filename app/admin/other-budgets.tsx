'use client';

import { useActionState } from 'react';
import { deleteBudget, type AdminState } from './actions';

type Row = { id: string; name: string; updatedAt: string; lines: number };

/**
 * Budgets that are no longer the active one — earlier years, and whatever an
 * import replaced. They are kept rather than cleaned up automatically, because
 * their imported bookings are the only local record of a closed year.
 */
export function OtherBudgets({ budgets }: { budgets: Row[] }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(deleteBudget, {});

  return (
    <form action={formAction} className="card admin-block">
      <div className="section-head">
        <h2>Aiemmat talousarviot</h2>
        <span className="label">eivät näy etusivulla</span>
      </div>
      <table>
        <tbody>
          {budgets.map((budget) => (
            <tr key={budget.id}>
              <td>
                <strong>{budget.name}</strong>
                <br />
                <span className="label">
                  Muokattu {budget.updatedAt} · {budget.lines} riviä
                </span>
              </td>
              <td className="right">
                <button className="link-button" name="budgetId" value={budget.id} disabled={pending}>
                  Poista
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="label">
        Poistaminen vie mukanaan talousarvion rivit. Kitsaasta haetut kirjaukset säilyvät, koska ne kuuluvat
        kirjanpitoon eivätkä yksittäiseen talousarvioon. Kitsaaseen ei kosketa.
      </p>
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
