'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { deleteBudget, type AdminState } from './actions';

type Row = { id: string; name: string; updatedAt: string; lines: number };

/**
 * Every talousarvio other than the one open above. They are kept rather than
 * cleaned up automatically, because their imported bookings are the only local
 * record of a closed year — and because a closed year's account mapping is
 * often the thing that needs correcting.
 */
export function OtherBudgets({ budgets }: { budgets: Row[] }) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(deleteBudget, {});

  return (
    <form action={formAction} className="card admin-block">
      <div className="section-head">
        <h2>Muut talousarviot</h2>
        <span className="label">avaa muokattavaksi</span>
      </div>
      <table>
        <tbody>
          {budgets.map((budget) => (
            <tr key={budget.id}>
              <td>
                <Link href={`/admin?talousarvio=${encodeURIComponent(budget.id)}`}>
                  <strong>{budget.name}</strong>
                </Link>
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
