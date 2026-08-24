import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { kitsasIsConfigured } from '@/lib/kitsas';
import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import type { Prisma } from '@prisma/client';
import { CategoryDetail } from './category-detail';
import { KitsasPending, Pending } from './kitsas-pending';

const money = (cents: number, currency = 'EUR') => new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
const date = (value: Date) => new Intl.DateTimeFormat('fi-FI').format(value);
const dateTime = (value: Date) => new Intl.DateTimeFormat('fi-FI', { dateStyle: 'short', timeStyle: 'short' }).format(value);

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const budget = await prisma.budget.findFirst({ where: { createdById: session.user.id }, orderBy: { updatedAt: 'desc' }, include: { lines: { orderBy: { sortOrder: 'asc' } }, expenses: { orderBy: { occurredOn: 'desc' } } } });
  const lastSync = budget ? await prisma.syncRun.findFirst({ where: { budgetId: budget.id, source: 'KITSAS', status: 'COMPLETED' }, orderBy: { completedAt: 'desc' } }) : null;
  // A budget imported moments ago has no figures yet; show them as pending
  // rather than as a confident row of zeroes.
  const awaitingKitsas = Boolean(budget) && kitsasIsConfigured() && !lastSync;
  return <main className="shell"><header className="topbar"><a className="brand" href="/">BUDU</a><div className="user"><span>{session.user.email}</span><form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}><button className="link-button">Kirjaudu ulos</button></form></div></header>{budget ? <Dashboard budget={budget} configured={kitsasIsConfigured()} lastFetchedAt={lastSync?.completedAt ?? null} awaitingKitsas={awaitingKitsas} /> : <Setup />}</main>;
}

function Setup() { return <section className="setup"><p className="eyebrow">Aloita tästä</p><h1>Tuo ensimmäinen talousarvio.</h1><p className="lede">Lähetä talousarvio CSV- tai Excel-tiedostona. Budu säilyttää suunnitelman erillään Kitsaasta luetuista toteutuneista kuluista.</p><div className="card"><h2>Tarvittavat sarakkeet</h2><ul><li><code>category</code>, talousarvion kohta</li><li><code>planned</code>, summa euroina (esimerkiksi <code>1250.50</code>)</li><li>Vapaaehtoiset: <code>account</code> (Kitsaan tilinumero), <code>description</code>, <code>kind</code> (<code>income</code> tai <code>expense</code> riveittäin), <code>budget_name</code>, <code>currency</code></li></ul><a className="button" href="/import">Tuo talousarvio</a></div></section>; }


/**
 * Row status. Only states worth acting on are marked: overspending, and
 * spending that is running ahead of last year at the same point in the period.
 * Being under budget or behind last year is left unmarked, because underspend
 * is a normal and perfectly acceptable state for a budget line to be in.
 *
 * "Ahead of last year" needs last year to have had something to be ahead of,
 * otherwise every newly used account would be flagged on its first booking.
 */
type RowStatus = { tone: 'over' | 'ahead' | 'good'; label: string } | null;

function rowStatus(kind: string, plannedCents: number, used: number, prior: number): RowStatus {
  if (kind === 'INCOME') {
    if (plannedCents > 0 && used >= plannedCents) return { tone: 'good', label: 'Tavoite saavutettu' };
    return null;
  }
  if (plannedCents > 0 && used > plannedCents) return { tone: 'over', label: 'Yli arvion' };
  if (plannedCents === 0 && used > 0) return { tone: 'ahead', label: 'Ei arviota' };
  if (prior > 0 && used > prior) return { tone: 'ahead', label: 'Edellä viime vuotta' };
  return null;
}

type DashboardBudget = Prisma.BudgetGetPayload<{ include: { lines: true; expenses: true } }>;

function Dashboard({ budget, configured, lastFetchedAt, awaitingKitsas }: { budget: DashboardBudget; configured: boolean; lastFetchedAt: Date | null; awaitingKitsas: boolean }) {
  const now = new Date();
  const periodStart = budget.startsOn || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = budget.endsOn && budget.endsOn < now ? budget.endsOn : now;
  const fullPeriodEnd = budget.endsOn || new Date(Date.UTC(periodStart.getUTCFullYear(), 11, 31));
  const previousStart = new Date(periodStart); previousStart.setUTCFullYear(previousStart.getUTCFullYear() - 1);
  const previousFullEnd = new Date(fullPeriodEnd); previousFullEnd.setUTCFullYear(previousFullEnd.getUTCFullYear() - 1);
  const previousEnd = new Date(periodEnd); previousEnd.setUTCFullYear(previousEnd.getUTCFullYear() - 1);
  const current = budget.expenses.filter((item) => item.occurredOn >= periodStart && item.occurredOn <= periodEnd);
  // The table compares like-for-like; the chart wants the completed year.
  const previous = budget.expenses.filter((item) => item.occurredOn >= previousStart && item.occurredOn <= previousEnd);
  const previousFull = budget.expenses.filter((item) => item.occurredOn >= previousStart && item.occurredOn <= previousFullEnd);
  const planned = budget.lines.filter((line) => line.kind === 'EXPENSE').reduce((total, line) => total + line.plannedCents, 0);
  const incomePlanned = budget.lines.filter((line) => line.kind === 'INCOME').reduce((total, line) => total + line.plannedCents, 0);
  const actual = current.filter((item) => item.kind === 'EXPENSE').reduce((total, item) => total + item.amountCents, 0);
  const remaining = planned - actual;
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  /** rawPayload holds whatever the sync stored; only a well-formed attachment list is passed on. */
  const attachmentsOf = (payload: DashboardBudget['expenses'][number]['rawPayload']) => {
    const list = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as { attachments?: unknown }).attachments : null;
    if (!Array.isArray(list)) return undefined;
    const files = list
      .filter((file): file is { id: number; nimi?: string; name?: string; type?: string } => Boolean(file) && typeof file === 'object')
      .map((file) => ({ id: Number(file.id), name: String(file.name ?? file.nimi ?? 'Liite'), type: String(file.type ?? '') }))
      .filter((file) => Number.isSafeInteger(file.id) && file.id > 0);
    return files.length ? files : undefined;
  };
  const itemsFor = (items: DashboardBudget['expenses'], category: string) =>
    items.filter((item) => (item.category || 'Kohdistamaton') === category)
      .map((item) => ({ id: item.id, date: iso(item.occurredOn), description: item.description, amountCents: item.amountCents, attachments: attachmentsOf(item.rawPayload) }));
  const byCategory = new Map<string, number>(); for (const expense of current) { const key = expense.category || 'Kohdistamaton'; byCategory.set(key, (byCategory.get(key) || 0) + expense.amountCents); }
  const previousByCategory = new Map<string, number>(); for (const expense of previous) { const key = expense.category || 'Kohdistamaton'; previousByCategory.set(key, (previousByCategory.get(key) || 0) + expense.amountCents); }
  return <><p className="eyebrow">Nykyinen talousarvio</p><h1>{budget.name}</h1><p className="lede">Kuluva kausi verrattuna viime vuoden vastaavaan ajankohtaan.</p>{!configured && <p className="notice">Kitsasta ei ole vielä yhdistetty. Mitään tietoja ei haeta ulkopuolelta.</p>}<section className="summary"><div className="card"><span className="label">Menoarvio</span><strong>{money(planned, budget.currency)}</strong></div><div className="card"><span className="label">Tuloarvio</span><strong>{money(incomePlanned, budget.currency)}</strong></div><div className="card"><span className="label">Toteutuneet menot</span><strong>{awaitingKitsas ? <Pending wide /> : money(actual, budget.currency)}</strong></div><div className="card"><span className="label">Menoarviota jäljellä</span><strong className={awaitingKitsas ? undefined : remaining < 0 ? 'negative' : 'positive'}>{awaitingKitsas ? <Pending wide /> : money(remaining, budget.currency)}</strong></div></section><div className="actions"><a className="button secondary" href="/import">Vaihda talousarvio</a>{awaitingKitsas ? <KitsasPending budgetId={budget.id} /> : <p className="label">{lastFetchedAt ? `Haettu Kitsaasta ${dateTime(lastFetchedAt)}.` : 'Kitsaasta ei ole vielä haettu tietoja.'} Tiedot päivittyvät kerran vuorokaudessa.</p>}</div><section className="grid" style={{ marginTop: 16 }}><div className="card"><div className="section-head"><h2>Talousarvion kohdat</h2><span className="label">kuluva / viime vuosi</span></div><table><thead><tr><th>Kohta</th><th className="right">Arvio</th><th className="right">Tänä vuonna</th><th className="right">Viime vuonna</th><th className="right">Jäljellä</th></tr></thead><tbody>{budget.lines.map((line, index) => { const used = byCategory.get(line.category) || 0; const prior = previousByCategory.get(line.category) || 0; const heading = line.groupName && line.groupName !== budget.lines[index - 1]?.groupName ? line.groupName : null; const status = awaitingKitsas ? null : rowStatus(line.kind, line.plannedCents, used, prior); return <Fragment key={line.id}>{heading && <tr className="group-row"><th colSpan={5} scope="colgroup">{heading}</th></tr>}<tr><td><CategoryDetail category={line.category} kind={line.kind} account={line.kitsasAccount} currency={budget.currency} plannedCents={line.plannedCents} periodStart={iso(periodStart)} periodEnd={iso(fullPeriodEnd)} todayIso={iso(periodEnd)} previousStart={iso(previousStart)} current={itemsFor(current, line.category)} previous={itemsFor(previousFull, line.category)} /><br/><span className="label">{line.kind === 'INCOME' ? 'Tulo' : 'Meno'}{line.kitsasAccount ? ` · tili ${line.kitsasAccount}` : ''}</span>{status && <span className={`badge badge-${status.tone}`}>{status.label}</span>}</td><td className="right">{money(line.plannedCents, budget.currency)}</td><td className="right">{awaitingKitsas ? <Pending /> : money(used, budget.currency)}</td><td className="right">{awaitingKitsas ? <Pending /> : money(prior, budget.currency)}</td><td className={`right${status?.tone === 'over' ? ' negative' : ''}`}>{awaitingKitsas ? <Pending /> : money(line.plannedCents - used, budget.currency)}</td></tr></Fragment>; })}</tbody></table></div><div className="card"><div className="section-head"><h2>Viimeisimmät menot</h2><span className="label">kuluva kausi</span></div>{current.filter((item) => item.kind === 'EXPENSE').length ? <table><tbody>{current.filter((item) => item.kind === 'EXPENSE').slice(0, 8).map(item => <tr key={item.id}><td><strong>{item.description}</strong><br/><span className="label">{date(item.occurredOn)} · {item.category || 'Kohdistamaton'}</span></td><td className="right">{money(item.amountCents, budget.currency)}</td></tr>)}</tbody></table> : awaitingKitsas ? <div className="empty"><Pending wide /></div> : <div className="empty">Kuluvalle kaudelle ei ole vielä haettu toteutuneita menoja Kitsaasta.</div>}</div></section></>;
}
