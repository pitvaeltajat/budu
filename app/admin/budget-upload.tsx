'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Uploads through the import route rather than a Server Action: actions cap the
 * request body at 1 MB by default, and the route already accepts the 5 MB a
 * real Talousarvio workbook can reach.
 *
 * An import does not overwrite anything. It creates a budget, and being the
 * newest makes it the one the dashboard shows; the previous one stays intact
 * below, with its imported bookings, until an admin deletes it.
 */
export function BudgetUpload({ replacing }: { replacing: string | null }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function upload(form: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/budgets/import', { method: 'POST', body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        setError(body?.error || 'Tuonti epäonnistui.');
        setBusy(false);
        return;
      }
      // The dashboard fetches the Kitsas figures itself; a large book takes tens
      // of seconds and that is a poor thing to make an upload wait on.
      router.push('/');
    } catch {
      setError('Tuonti epäonnistui.');
      setBusy(false);
    }
  }

  return (
    <form className="card admin-block" action={upload}>
      <div className="section-head">
        <h2>{replacing ? 'Vaihda talousarvio' : 'Tuo talousarvio'}</h2>
        <span className="label">CSV, XLS tai XLSX · enintään 5 Mt</span>
      </div>
      <p className="label">
        {replacing ? (
          <>
            Tuotu tiedosto tulee heti kaikkien näkyviin nykyisen tilalle. <strong>{replacing}</strong> säilyy alla,
            kunnes poistat sen.
          </>
        ) : (
          'Tiedostosta luetaan ensimmäinen välilehti. Budu tunnistaa sekä tavallisen talousarviopohjan että yksinkertaisen category/planned-muodon.'
        )}
      </p>
      <div className="form-row">
        <label htmlFor="budget-file">Talousarviotiedosto</label>
        <input id="budget-file" name="file" type="file" accept=".csv,.xlsx,.xls" required />
      </div>
      <div className="form-row">
        <label htmlFor="budget-import-name">Nimi (vapaaehtoinen)</label>
        <input id="budget-import-name" name="name" placeholder="Talousarvio 2026" />
      </div>
      <div className="form-row">
        <label htmlFor="budget-import-year">Vuosi (vapaaehtoinen)</label>
        <input id="budget-import-year" name="year" inputMode="numeric" pattern="20[0-9]{2}" placeholder="2025" />
      </div>
      <p className="label">
        Talousarviopohjassa on useamman vuoden sarakkeet. Tyhjänä tuodaan uusin vuosi; anna vuosi, jos haluat tuoda
        päättyneen kauden vertailtavaksi.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <div className="editor-footer">
        <span className="label">Toteutuneet kirjaukset haetaan Kitsaasta tuonnin jälkeen.</span>
        <button className="button secondary" disabled={busy}>
          {busy ? 'Tuodaan…' : replacing ? 'Tuo uusi talousarvio' : 'Tuo talousarvio'}
        </button>
      </div>
    </form>
  );
}
