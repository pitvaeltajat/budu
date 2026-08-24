'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ImportPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function upload(form: FormData) {
    setBusy(true); setMessage(null);
    const response = await fetch('/api/budgets/import', { method: 'POST', body: form });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setMessage(body?.error || 'Import failed.'); setBusy(false); return; }
    router.push('/');
  }
  return <main className="shell"><header className="topbar"><Link className="brand" href="/">bu<span>du</span></Link></header><section className="setup"><p className="eyebrow">Budget import</p><h1>Upload your plan.</h1><p className="lede">CSV and Excel workbooks are supported. The first worksheet is used.</p><form className="card" action={upload}><div className="form-row"><label htmlFor="file">Budget file</label><input id="file" name="file" type="file" accept=".csv,.xlsx,.xls" required /></div><div className="form-row"><label htmlFor="name">Budget name (optional)</label><input id="name" name="name" placeholder="2026 talousarvio" /></div><p className="label">Budu recognizes both a simple <code>category</code>/<code>planned</code> sheet and the multi-year Finnish Talousarvio format. Talousarvio imports use <code>tilinumero</code> as the Kitsas match key.</p>{message && <p className="notice">{message}</p>}<button className="button" disabled={busy}>{busy ? 'Importing…' : 'Import budget'}</button></form></section></main>;
}
