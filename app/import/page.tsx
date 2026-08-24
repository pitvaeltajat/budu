'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ImportPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(form: FormData) {
    setBusy(true); setMessage(null);
    const response = await fetch('/api/budgets/import', { method: 'POST', body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setMessage(body?.error || 'Tuonti epäonnistui.'); setBusy(false); return; }
    if (body?.syncError) { setMessage(`Talousarvio tuotiin, mutta Kitsaan haku epäonnistui: ${body.syncError}`); setBusy(false); return; }
    router.push('/');
  }
  return <main className="shell"><header className="topbar" /><section className="setup"><p className="eyebrow">Talousarvion tuonti</p><h1>Lähetä talousarvio.</h1><p className="lede">CSV- ja Excel-tiedostot käyvät. Tiedostosta luetaan ensimmäinen välilehti.</p><form className="card" action={upload}><div className="form-row"><label htmlFor="file">Talousarviotiedosto</label><input id="file" name="file" type="file" accept=".csv,.xlsx,.xls" required /></div><div className="form-row"><label htmlFor="name">Talousarvion nimi (vapaaehtoinen)</label><input id="name" name="name" placeholder="Talousarvio 2026" /></div><p className="label">Budu tunnistaa tavallisen talousarviopohjan ja yhdistää <code>tilinumero</code>-sarakkeen Kitsaan tileihin. Yksinkertaisessa tuonnissa voit ohittaa tilin oletuksen rivikohtaisesti lisäämällä <code>kind</code>-sarakkeen arvolla <code>income</code> tai <code>expense</code>.</p>{message && <p className="notice">{message}</p>}<button className="button" disabled={busy}>{busy ? 'Tuodaan ja haetaan Kitsaasta...' : 'Tuo talousarvio'}</button></form></section></main>;
}
