'use client';

import { useActionState } from 'react';
import { refetchKitsas, type AdminState } from './actions';

/** Runs the daily Kitsas sync now instead of waiting for the night. */
export function KitsasRefetch() {
  const [state, formAction, pending] = useActionState<AdminState>(refetchKitsas, {});

  return (
    <form action={formAction} className="card admin-block">
      <div className="section-head">
        <h2>Kitsas</h2>
        <button className="button" disabled={pending}>
          {pending ? 'Haetaan…' : 'Hae kirjaukset nyt'}
        </button>
      </div>
      <p className="label">Sama haku, joka ajetaan joka yö. Kitsaaseen ei kosketa.</p>
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
