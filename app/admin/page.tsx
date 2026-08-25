import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth, isAdminEmail } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetOrder } from '@/lib/budget';
import { BudgetEditor } from './budget-editor';
import { BudgetUpload } from './budget-upload';
import { OtherBudgets } from './other-budgets';

const date = (value: Date) => new Intl.DateTimeFormat('fi-FI').format(value);

/**
 * Everything that changes the shared talousarvio lives here: replacing it,
 * reclassifying a row between meno and tulo, and correcting planned amounts.
 * The dashboard stays read-only for everyone, admins included.
 */
export default async function AdminPage() {
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
  const [active, ...previous] = budgets;
  const lines = active
    ? await prisma.budgetLine.findMany({
        where: { budgetId: active.id },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, category: true, groupName: true, kitsasAccount: true, plannedCents: true, kind: true },
      })
    : [];

  return shell(
    <>
      <p className="eyebrow">Ylläpito</p>
      <h1>Talousarvion hallinta</h1>
      <p className="lede">Muutokset näkyvät heti kaikille yhdistyksen tunnuksille, jotka kirjautuvat Buduun.</p>

      {active ? (
        <BudgetEditor
          budgetId={active.id}
          name={active.name}
          currency={active.currency}
          period={active.startsOn && active.endsOn ? `${date(active.startsOn)} – ${date(active.endsOn)}` : null}
          lines={lines}
        />
      ) : (
        <div className="card admin-block">
          <h2>Ei vielä talousarviota</h2>
          <p className="label">Tuo talousarvio alta, niin se tulee näkyviin kaikille.</p>
        </div>
      )}

      <BudgetUpload replacing={active?.name ?? null} />
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
