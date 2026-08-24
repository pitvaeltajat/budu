import { auth, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { kitsasIsConfigured } from '@/lib/kitsas';
import { redirect } from 'next/navigation';
import type { Prisma } from '@prisma/client';

const money = (cents: number, currency = 'EUR') => new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
const date = (value: Date) => new Intl.DateTimeFormat('fi-FI').format(value);

export default async function Home() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const budget = await prisma.budget.findFirst({ where: { createdById: session.user.id }, orderBy: { updatedAt: 'desc' }, include: { lines: { orderBy: { sortOrder: 'asc' } }, expenses: { orderBy: { occurredOn: 'desc' } } } });
  return <main className="shell"><header className="topbar"><div className="user"><span>{session.user.email}</span><form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }); }}><button className="link-button">Sign out</button></form></div></header>{budget ? <Dashboard budget={budget} configured={kitsasIsConfigured()} /> : <Setup />}</main>;
}

function Setup() { return <section className="setup"><p className="eyebrow">Start here</p><h1>Bring in your first budget.</h1><p className="lede">Upload the budget workbook or CSV when it is ready. Budu will store the plan separately from the read-only realized-expense feed.</p><div className="card"><h2>Expected columns</h2><ul><li><code>category</code> — a unique budget category</li><li><code>planned</code> — amount in euros (for example <code>1250.50</code>)</li><li>Optional: <code>account</code> (Kitsas expense account), <code>description</code>, <code>kind</code> (<code>income</code>/<code>expense</code> per row), <code>budget_name</code>, <code>currency</code></li></ul><a className="button" href="/import">Import a budget</a></div></section>; }

type DashboardBudget = Prisma.BudgetGetPayload<{ include: { lines: true; expenses: true } }>;

function Dashboard({ budget, configured }: { budget: DashboardBudget; configured: boolean }) {
  const now = new Date();
  const periodStart = budget.startsOn || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = budget.endsOn && budget.endsOn < now ? budget.endsOn : now;
  const previousStart = new Date(periodStart); previousStart.setUTCFullYear(previousStart.getUTCFullYear() - 1);
  const previousEnd = new Date(periodEnd); previousEnd.setUTCFullYear(previousEnd.getUTCFullYear() - 1);
  const current = budget.expenses.filter((item) => item.occurredOn >= periodStart && item.occurredOn <= periodEnd);
  const previous = budget.expenses.filter((item) => item.occurredOn >= previousStart && item.occurredOn <= previousEnd);
  const planned = budget.lines.filter((line) => line.kind === 'EXPENSE').reduce((total, line) => total + line.plannedCents, 0);
  const actual = current.filter((item) => item.kind === 'EXPENSE').reduce((total, item) => total + item.amountCents, 0);
  const remaining = planned - actual;
  const byCategory = new Map<string, number>(); for (const expense of current) { const key = expense.category || 'Uncategorized'; byCategory.set(key, (byCategory.get(key) || 0) + expense.amountCents); }
  const previousByCategory = new Map<string, number>(); for (const expense of previous) { const key = expense.category || 'Uncategorized'; previousByCategory.set(key, (previousByCategory.get(key) || 0) + expense.amountCents); }
  return <><p className="eyebrow">Current budget</p><h1>{budget.name}</h1><p className="lede">Current period compared with the same period last year.</p>{!configured && <p className="notice">Kitsas is not connected yet. No external data is being requested.</p>}<section className="summary"><div className="card"><span className="label">Expense budget</span><strong>{money(planned, budget.currency)}</strong></div><div className="card"><span className="label">Realized expenses</span><strong>{money(actual, budget.currency)}</strong></div><div className="card"><span className="label">Expense budget remaining</span><strong className={remaining < 0 ? 'negative' : 'positive'}>{money(remaining, budget.currency)}</strong></div></section><div className="actions"><a className="button secondary" href="/import">Replace budget</a><form action="/api/kitsas/sync" method="post"><button className="button" disabled={!configured}>Refresh from Kitsas</button></form></div><section className="grid" style={{ marginTop: 16 }}><div className="card"><div className="section-head"><h2>Budget categories</h2><span className="label">current / last year</span></div><table><thead><tr><th>Category</th><th className="right">Budget</th><th className="right">This year</th><th className="right">Last year</th><th className="right">Left</th></tr></thead><tbody>{budget.lines.map(line => { const used = byCategory.get(line.category) || 0; const prior = previousByCategory.get(line.category) || 0; return <tr key={line.id}><td>{line.category}<br/><span className="label">{line.kind === 'INCOME' ? 'Income' : 'Expense'}{line.kitsasAccount ? ` · account ${line.kitsasAccount}` : ''}</span></td><td className="right">{money(line.plannedCents, budget.currency)}</td><td className="right">{money(used, budget.currency)}</td><td className="right">{money(prior, budget.currency)}</td><td className="right">{money(line.plannedCents - used, budget.currency)}</td></tr>; })}</tbody></table></div><div className="card"><div className="section-head"><h2>Latest expenses</h2><span className="label">current period</span></div>{current.filter((item) => item.kind === 'EXPENSE').length ? <table><tbody>{current.filter((item) => item.kind === 'EXPENSE').slice(0, 8).map(item => <tr key={item.id}><td><strong>{item.description}</strong><br/><span className="label">{date(item.occurredOn)} · {item.category || 'Uncategorized'}</span></td><td className="right">{money(item.amountCents, budget.currency)}</td></tr>)}</tbody></table> : <div className="empty">No realized expenses imported for the current period. Refresh from Kitsas after configuring the read-only connection.</div>}</div></section></>;
}
