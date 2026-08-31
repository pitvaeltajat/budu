import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAdminEmail } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetOrder, activeFirst } from '@/lib/budget';
import { BudgetEditor } from './budget-editor';
import { BudgetUpload } from './budget-upload';
import { OtherBudgets } from './other-budgets';
import { UnmappedAccounts } from './unmapped-accounts';
import { PeriodSwitcher } from '../period-switcher';

const date = (value: Date) => new Intl.DateTimeFormat('fi-FI').format(value);

/**
 * Everything that changes the shared talousarvio lives here: replacing it,
 * reclassifying a row between meno and tulo, and correcting planned amounts.
 * The dashboard stays read-only for everyone, admins included.
 */
export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const shell = (body: React.ReactNode) => (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          BUDU
        </Link>
        <div className="user">
          <Link href="/">Etusivulle</Link>
          <span>{session.user.email}</span>
        </div>
      </header>
      {body}
    </main>
  );

  if (!isAdminEmail(session.user.email)) {
    return shell(
      <section className="setup">
        <p className="eyebrow">Ylläpito</p>
        <h1>Vain ylläpitäjä voi muokata talousarviota.</h1>
        <p className="lede">Talousarvio näkyy sinulle etusivulla sellaisena kuin ylläpitäjä on sen tuonut.</p>
      </section>,
    );
  }

  const budgets = await prisma.budget.findMany({
    orderBy: activeBudgetOrder,
    select: {
      id: true,
      name: true,
      currency: true,
      startsOn: true,
      endsOn: true,
      updatedAt: true,
      _count: { select: { lines: true } },
    },
  });
  /**
   * The live period leads, as on the dashboard, but any of them can be opened
   * with `?talousarvio=`. Editing only ever the live one was wrong in the way
   * that matters: a closed year's account mapping is exactly the thing that
   * needs correcting, and it was the one thing unreachable from here.
   */
  const periods = activeFirst(budgets);
  const requested = (await searchParams).talousarvio;
  const selected =
    (typeof requested === 'string' ? periods.find((period) => period.id === requested) : undefined) ?? periods[0];
  const previous = periods.filter((period) => period.id !== selected?.id);
  const lines = selected
    ? await prisma.budgetLine.findMany({
        where: { budgetId: selected.id },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, category: true, groupName: true, kitsasAccount: true, plannedCents: true, kind: true },
      })
    : [];
  // Worst first: what a mapping mistake costs is measured in euros, not in rows.
  const unmapped = selected
    ? await prisma.kitsasUnmappedAccount.findMany({
        where: { budgetId: selected.id },
        orderBy: [{ debetCents: 'desc' }, { kreditCents: 'desc' }],
        select: { account: true, name: true, entries: true, debetCents: true, kreditCents: true },
      })
    : [];

  return shell(
    <>
      <p className="eyebrow">Ylläpito</p>
      <h1>Talousarvion hallinta</h1>
      {selected && <PeriodSwitcher periods={periods} selectedId={selected.id} basePath="/admin" />}
      <p className="lede">Muutokset näkyvät heti kaikille yhdistyksen tunnuksille, jotka kirjautuvat Buduun.</p>

      {selected ? (
        <BudgetEditor
          budgetId={selected.id}
          name={selected.name}
          currency={selected.currency}
          period={selected.startsOn && selected.endsOn ? `${date(selected.startsOn)} – ${date(selected.endsOn)}` : null}
          live={selected.id === periods[0]?.id}
          lines={lines}
        />
      ) : (
        <div className="card admin-block">
          <h2>Ei vielä talousarviota</h2>
          <p className="label">Tuo talousarvio alta, niin se tulee näkyviin kaikille.</p>
        </div>
      )}

      {selected && <UnmappedAccounts accounts={unmapped} currency={selected.currency} />}

      <BudgetUpload replacing={periods[0]?.name ?? null} />
      {previous.length > 0 && (
        <OtherBudgets
          budgets={previous.map((budget) => ({
            id: budget.id,
            name: budget.name,
            updatedAt: date(budget.updatedAt),
            lines: budget._count.lines,
          }))}
        />
      )}
    </>,
  );
}
