import { auth, isAdminEmail, signOut } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { activeBudgetOrder, activeFirst } from '@/lib/budget';
import { realizedCents } from '@/lib/realized';
import { kitsasIsConfigured } from '@/lib/kitsas';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Fragment } from 'react';
import type { Prisma } from '@prisma/client';
import { summarisePace } from '@/lib/budget-pace';
import { sectionsOf, worthTotalling } from '@/lib/budget-groups';
import { AttachmentLinks } from './attachment-links';
import { CategoryDetail, type CategoryDetailProps } from './category-detail';
import { Overview } from './overview';
import { KitsasPending, Pending } from './kitsas-pending';
import { PeriodSwitcher, type Period } from './period-switcher';

const money = (cents: number, currency = 'EUR') =>
  new Intl.NumberFormat('fi-FI', { style: 'currency', currency }).format(cents / 100);
const date = (value: Date) => new Intl.DateTimeFormat('fi-FI').format(value);
const dateTime = (value: Date) =>
  new Intl.DateTimeFormat('fi-FI', { dateStyle: 'short', timeStyle: 'short' }).format(value);

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const admin = isAdminEmail(session.user.email);
  /**
   * The shared talousarviot, live period first; see lib/budget.ts for why this
   * is not scoped to the viewer. `?talousarvio=` opens a closed year instead of
   * the live one — everything below reads the budget's own period, so a past
   * year brings its own comparison year with it and needs no special casing.
   */
  const periods = activeFirst(
    await prisma.budget.findMany({
      orderBy: activeBudgetOrder,
      select: { id: true, name: true, startsOn: true, endsOn: true, updatedAt: true },
    }),
  );
  const requested = (await searchParams).talousarvio;
  const selectedId =
    (typeof requested === 'string' && periods.find((period) => period.id === requested)?.id) || periods[0]?.id;
  const budget = selectedId
    ? await prisma.budget.findUnique({
        where: { id: selectedId },
        include: { lines: { orderBy: { sortOrder: 'asc' } } },
      })
    : null;
  /**
   * Bookings are joined by account rather than carried on the budget, so this
   * fetches the two periods the dashboard compares and lets the render decide
   * which side of each entry counts. Both years in one query: the set is a small
   * association's bookings for two years, and slicing it in memory keeps the
   * period arithmetic in one place.
   */
  const accounts = budget
    ? budget.lines.map((line) => line.kitsasAccount).filter((account): account is number => account !== null)
    : [];
  const entries =
    budget && accounts.length
      ? await prisma.kitsasEntry.findMany({
          where: {
            account: { in: accounts },
            occurredOn: { gte: previousPeriodStart(budget), lte: periodEndOf(budget) },
          },
          orderBy: { occurredOn: 'desc' },
        })
      : [];
  const lastSync = budget
    ? await prisma.syncRun.findFirst({
        where: { budgetId: budget.id, source: 'KITSAS', status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
      })
    : null;
  /**
   * Money Kitsas holds on accounts this talousarvio maps nothing to. Surfaced
   * here and not only on /admin because it is the one fault that makes every
   * figure on this page too low while nothing else looks wrong at all.
   */
  const unmapped = budget
    ? await prisma.kitsasUnmappedAccount.aggregate({
        where: { budgetId: budget.id },
        _count: true,
        _sum: { debetCents: true, kreditCents: true },
      })
    : null;
  // A budget imported moments ago has no figures yet; show them as pending
  // rather than as a confident row of zeroes.
  const awaitingKitsas = Boolean(budget) && kitsasIsConfigured() && !lastSync;
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          BUDU
        </Link>
        <div className="user">
          {admin && <Link href="/admin">Ylläpito</Link>}
          <span>{session.user.email}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/login' });
            }}
          >
            <button className="link-button">Kirjaudu ulos</button>
          </form>
        </div>
      </header>
      {budget ? (
        <Dashboard
          budget={budget}
          entries={entries}
          admin={admin}
          configured={kitsasIsConfigured()}
          lastFetchedAt={lastSync?.completedAt ?? null}
          awaitingKitsas={awaitingKitsas}
          periods={periods}
          unmapped={{
            accounts: unmapped?._count ?? 0,
            cents: (unmapped?._sum.debetCents ?? 0) + (unmapped?._sum.kreditCents ?? 0),
          }}
        />
      ) : (
        <Setup admin={admin} />
      )}
    </main>
  );
}

/** Start of the budget's own period, defaulting to the calendar year. */
function periodStartOf(budget: { startsOn: Date | null }) {
  return budget.startsOn || new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
}

/** End of the full budget period, which is the far edge of what the chart draws. */
function periodEndOf(budget: { startsOn: Date | null; endsOn: Date | null }) {
  return budget.endsOn || new Date(Date.UTC(periodStartOf(budget).getUTCFullYear(), 11, 31));
}

function previousPeriodStart(budget: { startsOn: Date | null }) {
  const start = new Date(periodStartOf(budget));
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return start;
}

/**
 * Shown until a talousarvio exists. Only an admin can do anything about that,
 * so everyone else is told who to ask rather than handed a button that answers
 * 403.
 */
function Setup({ admin }: { admin: boolean }) {
  if (!admin)
    return (
      <section className="setup">
        <p className="eyebrow">Ei vielä talousarviota</p>
        <h1>Talousarviota ei ole vielä tuotu.</h1>
        <p className="lede">
          Kun ylläpitäjä on tuonut talousarvion, se näkyy tällä sivulla kaikille yhdistyksen tunnuksille.
        </p>
      </section>
    );
  return (
    <section className="setup">
      <p className="eyebrow">Aloita tästä</p>
      <h1>Tuo ensimmäinen talousarvio.</h1>
      <p className="lede">
        Lähetä talousarvio CSV- tai Excel-tiedostona. Budu säilyttää suunnitelman erillään Kitsaasta luetuista
        toteutuneista kuluista.
      </p>
      <div className="card">
        <h2>Tarvittavat sarakkeet</h2>
        <ul>
          <li>
            <code>category</code>, talousarvion kohta
          </li>
          <li>
            <code>planned</code>, summa euroina (esimerkiksi <code>1250.50</code>)
          </li>
          <li>
            Vapaaehtoiset: <code>account</code> (Kitsaan tilinumero), <code>description</code>, <code>kind</code> (
            <code>income</code> tai <code>expense</code> riveittäin), <code>budget_name</code>, <code>currency</code>
          </li>
        </ul>
        <Link className="button" href="/admin">
          Tuo talousarvio
        </Link>
      </div>
    </section>
  );
}

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

const DAY = 86_400_000;

type DashboardBudget = Prisma.BudgetGetPayload<{ include: { lines: true } }>;
type DashboardLine = DashboardBudget['lines'][number];
type Entry = Prisma.KitsasEntryGetPayload<object>;

function Dashboard({
  budget,
  entries,
  admin,
  configured,
  lastFetchedAt,
  awaitingKitsas,
  periods,
  unmapped,
}: {
  budget: DashboardBudget;
  entries: Entry[];
  admin: boolean;
  configured: boolean;
  lastFetchedAt: Date | null;
  awaitingKitsas: boolean;
  periods: Period[];
  unmapped: { accounts: number; cents: number };
}) {
  const now = new Date();
  const periodStart = budget.startsOn || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = budget.endsOn && budget.endsOn < now ? budget.endsOn : now;
  const fullPeriodEnd = budget.endsOn || new Date(Date.UTC(periodStart.getUTCFullYear(), 11, 31));
  const previousStart = new Date(periodStart);
  previousStart.setUTCFullYear(previousStart.getUTCFullYear() - 1);
  const previousFullEnd = new Date(fullPeriodEnd);
  previousFullEnd.setUTCFullYear(previousFullEnd.getUTCFullYear() - 1);
  const previousEnd = new Date(periodEnd);
  previousEnd.setUTCFullYear(previousEnd.getUTCFullYear() - 1);
  /**
   * A period that has ended is not "so far this year": its figures are final,
   * and `periodEnd` above has already clamped to the budget's own end, so the
   * comparison is the whole of the year before rather than the same date in it.
   * A budget with no period at all — the simple category/planned import — is
   * never closed, because nothing says it has ended.
   */
  const closed = Boolean(budget.endsOn && budget.endsOn < now);
  const priorYear = previousStart.getUTCFullYear();
  const current = entries.filter((item) => item.occurredOn >= periodStart && item.occurredOn <= periodEnd);
  // The table compares like-for-like; the chart wants the completed year.
  const previous = entries.filter((item) => item.occurredOn >= previousStart && item.occurredOn <= previousEnd);
  const previousFull = entries.filter((item) => item.occurredOn >= previousStart && item.occurredOn <= previousFullEnd);
  /** Budget lines by Kitsas account, which is how a booking finds its row. */
  const lineFor = new Map<number, DashboardLine>();
  for (const line of budget.lines) if (line.kitsasAccount !== null) lineFor.set(line.kitsasAccount, line);
  const planned = budget.lines
    .filter((line) => line.kind === 'EXPENSE')
    .reduce((total, line) => total + line.plannedCents, 0);
  const incomePlanned = budget.lines
    .filter((line) => line.kind === 'INCOME')
    .reduce((total, line) => total + line.plannedCents, 0);
  /** Totals across one slice, counting each booking through its own line's kind. */
  const totalFor = (items: Entry[], kind: string) =>
    items.reduce((total, item) => {
      const line = lineFor.get(item.account);
      return line?.kind === kind ? total + realizedCents(line, item) : total;
    }, 0);
  const actual = totalFor(current, 'EXPENSE');
  const remaining = planned - actual;
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  /** rawPayload holds whatever the sync stored; only a well-formed attachment list is passed on. */
  const attachmentsOf = (payload: Entry['rawPayload']) => {
    const list =
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as { attachments?: unknown }).attachments
        : null;
    if (!Array.isArray(list)) return undefined;
    const files = list
      .filter(
        (file): file is { id: number; nimi?: string; name?: string; type?: string } =>
          Boolean(file) && typeof file === 'object',
      )
      .map((file) => ({
        id: Number(file.id),
        name: String(file.name ?? file.nimi ?? 'Liite'),
        type: String(file.type ?? ''),
      }))
      .filter((file) => Number.isSafeInteger(file.id) && file.id > 0);
    return files.length ? files : undefined;
  };
  /**
   * A line's own bookings. Entries that net to nothing on the side this line
   * reads are dropped: on an expense line a pure credit is a refund already
   * subtracted from the running total, and drawing it as its own point would put
   * a downward step on a cumulative chart.
   */
  const itemsFor = (items: Entry[], line: DashboardLine) =>
    items
      .filter((item) => item.account === line.kitsasAccount)
      .map((item) => ({
        id: `${item.voucherId}:${item.entryId}`,
        date: iso(item.occurredOn),
        description: item.description,
        amountCents: realizedCents(line, item),
        attachments: attachmentsOf(item.rawPayload),
      }))
      .filter((item) => item.amountCents > 0);
  /**
   * Realized totals keyed by category, which is the shape the pace summary and
   * the table both read. The account is what joins a booking to a line; the
   * category is only the label that lands on.
   */
  const totalsByCategory = (items: Entry[]) => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const line = lineFor.get(item.account);
      if (!line) continue;
      totals.set(line.category, (totals.get(line.category) || 0) + realizedCents(line, item));
    }
    return totals;
  };
  const byCategory = totalsByCategory(current);
  const previousByCategory = totalsByCategory(previous);
  /** Last year in full, which is what tells each line what its own year is shaped like. */
  const previousFullByCategory = totalsByCategory(previousFull);
  const elapsedDays = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / DAY));
  const totalDays = Math.max(elapsedDays, Math.round((fullPeriodEnd.getTime() - periodStart.getTime()) / DAY));
  const incomeActual = totalFor(current, 'INCOME');
  /** Recent spending: bookings that landed on an expense line, newest first. */
  const recentExpenses = current
    .map((item) => ({ item, line: lineFor.get(item.account) }))
    .filter((row): row is { item: Entry; line: DashboardLine } => row.line?.kind === 'EXPENSE')
    .map(({ item, line }) => ({
      id: `${item.voucherId}:${item.entryId}`,
      occurredOn: item.occurredOn,
      description: item.description,
      category: line.category,
      amountCents: realizedCents(line, item),
      attachments: attachmentsOf(item.rawPayload),
    }))
    .filter((row) => row.amountCents > 0);
  /**
   * The newest booking Kitsas actually holds, which is not the same thing as
   * when Budu last fetched. The Holvi import into Kitsas is run by hand, so the
   * book itself can be months behind while every sync reports success — and a
   * dashboard that only says when it fetched makes that look like underspending.
   */
  const newestBooking = current.reduce<Date | null>(
    (latest, item) => (!latest || item.occurredOn > latest ? item.occurredOn : latest),
    null,
  );
  /** The table's sections, each carrying its own totals; see lib/budget-groups.ts. */
  const sections = sectionsOf(budget.lines, byCategory, previousByCategory);
  /**
   * Everything a line's modal needs, keyed by category and built once. The
   * table, the overview's alerts and the recent-expense list all open the same
   * modal, and a line's bookings should not be gathered three times to do it.
   */
  const detailsByCategory: Record<string, CategoryDetailProps> = Object.fromEntries(
    budget.lines.map((line) => [
      line.category,
      {
        category: line.category,
        kind: line.kind,
        account: line.kitsasAccount,
        currency: budget.currency,
        plannedCents: line.plannedCents,
        periodStart: iso(periodStart),
        periodEnd: iso(fullPeriodEnd),
        todayIso: iso(periodEnd),
        previousStart: iso(previousStart),
        current: itemsFor(current, line),
        previous: itemsFor(previousFull, line),
      },
    ]),
  );
  /**
   * The figure columns' headings, named once. Narrow screens drop the header row
   * and stack each line into a card, where every figure has to carry its own
   * label — so the same four strings are read twice, and a closed period must
   * not be able to say "Tänä vuonna" in the header and "Kaudella" on the card.
   */
  const columns = {
    planned: 'Arvio',
    used: closed ? 'Kaudella' : 'Tänä vuonna',
    prior: closed ? `Vuonna ${priorYear}` : 'Viime vuonna',
    remaining: 'Jäljellä',
  };
  const pace = summarisePace({
    lines: budget.lines,
    usedByCategory: byCategory,
    priorByCategory: previousByCategory,
    priorFullByCategory: previousFullByCategory,
    elapsedDays,
    totalDays,
  });
  return (
    <>
      <p className="eyebrow">{closed ? 'Päättynyt talousarvio' : 'Nykyinen talousarvio'}</p>
      <h1>{budget.name}</h1>
      <PeriodSwitcher periods={periods} selectedId={budget.id} />
      <p className="lede">
        {closed
          ? `Koko kausi verrattuna vuoteen ${priorYear}.`
          : 'Kuluva kausi verrattuna viime vuoden vastaavaan ajankohtaan.'}
      </p>
      {!configured && <p className="notice">Kitsasta ei ole vielä yhdistetty. Mitään tietoja ei haeta ulkopuolelta.</p>}
      {unmapped.accounts > 0 && (
        <p className="notice">
          Kitsaassa on {money(unmapped.cents, budget.currency)} kirjauksia {unmapped.accounts} tilillä, joita tämä
          talousarvio ei tunne, eivätkä ne näy alla olevissa luvuissa.{' '}
          {admin ? (
            // Carries the budget being viewed: the mapping at fault is this
            // one's, which is not necessarily the live period's.
            <Link href={`/admin?talousarvio=${encodeURIComponent(budget.id)}`}>Korjaa tilikartta ylläpidossa.</Link>
          ) : (
            'Pyydä ylläpitäjää korjaamaan tilikartta.'
          )}
        </p>
      )}
      {configured && !awaitingKitsas && !previous.length && (
        <p className="notice">
          Vuodelta {priorYear} ei ole kirjauksia Kitsaassa, joten vertailusarake on tyhjä. Se ei tarkoita, ettei rahaa
          olisi liikkunut — kirjanpito on aloitettu Kitsaassa myöhemmin.
        </p>
      )}
      <section className="summary">
        <div className="card">
          <span className="label">Menoarvio</span>
          <strong>{money(planned, budget.currency)}</strong>
        </div>
        <div className="card">
          <span className="label">Tuloarvio</span>
          <strong>{money(incomePlanned, budget.currency)}</strong>
        </div>
        <div className="card">
          <span className="label">Toteutuneet menot</span>
          <strong>{awaitingKitsas ? <Pending wide /> : money(actual, budget.currency)}</strong>
        </div>
        <div className="card">
          <span className="label">Menoarviota jäljellä</span>
          <strong className={awaitingKitsas ? undefined : remaining < 0 ? 'negative' : 'positive'}>
            {awaitingKitsas ? <Pending wide /> : money(remaining, budget.currency)}
          </strong>
        </div>
      </section>
      <Overview
        currency={budget.currency}
        awaiting={awaitingKitsas}
        expense={{ usedCents: actual, plannedCents: planned, expectedCents: pace.expectedExpenseCents }}
        income={{ usedCents: incomeActual, plannedCents: incomePlanned, expectedCents: pace.expectedIncomeCents }}
        alerts={pace.alerts}
        details={detailsByCategory}
      />
      <div className="actions">
        {admin && (
          <Link className="button secondary" href="/admin">
            Muokkaa talousarviota
          </Link>
        )}
        {awaitingKitsas ? (
          <KitsasPending budgetId={budget.id} />
        ) : (
          <p className="label">
            {lastFetchedAt ? `Haettu Kitsaasta ${dateTime(lastFetchedAt)}.` : 'Kitsaasta ei ole vielä haettu tietoja.'}{' '}
            {newestBooking && `Uusin kirjaus Kitsaassa ${date(newestBooking)}. `}
            Tiedot päivittyvät kerran vuorokaudessa.
          </p>
        )}
      </div>
      <section className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="section-head">
            <h2>Talousarvion kohdat</h2>
            <span className="label">{closed ? `kausi / ${priorYear}` : 'kuluva / viime vuosi'}</span>
          </div>
          <table className="budget-table">
            <thead>
              <tr>
                <th>Kohta</th>
                <th className="right">{columns.planned}</th>
                <th className="right">{columns.used}</th>
                <th className="right">{columns.prior}</th>
                <th className="right">{columns.remaining}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((section) => (
                <Fragment key={section.name ?? 'ryhmittelemattomat'}>
                  {section.name && (
                    <tr className="group-row">
                      <th colSpan={5} scope="colgroup">
                        {section.name}
                      </th>
                    </tr>
                  )}
                  {section.lines.map((line) => {
                    const used = byCategory.get(line.category) || 0;
                    const prior = previousByCategory.get(line.category) || 0;
                    const status = awaitingKitsas ? null : rowStatus(line.kind, line.plannedCents, used, prior);
                    return (
                      <tr key={line.id}>
                        <td>
                          <CategoryDetail {...detailsByCategory[line.category]} />
                          <br />
                          <span className="label">
                            {line.kind === 'INCOME' ? 'Tulo' : 'Meno'}
                            {line.kitsasAccount ? ` · tili ${line.kitsasAccount}` : ''}
                          </span>
                          {status && <span className={`badge badge-${status.tone}`}>{status.label}</span>}
                        </td>
                        <td className="right" data-label={columns.planned}>
                          {money(line.plannedCents, budget.currency)}
                        </td>
                        <td className="right" data-label={columns.used}>
                          {awaitingKitsas ? <Pending /> : money(used, budget.currency)}
                        </td>
                        <td className="right" data-label={columns.prior}>
                          {awaitingKitsas ? <Pending /> : money(prior, budget.currency)}
                        </td>
                        <td
                          className={`right${status?.tone === 'over' ? ' negative' : ''}`}
                          data-label={columns.remaining}
                        >
                          {awaitingKitsas ? <Pending /> : money(line.plannedCents - used, budget.currency)}
                        </td>
                      </tr>
                    );
                  })}
                  {worthTotalling(section) &&
                    section.totals.map((total) => (
                      <tr className="total-row" key={`${section.name}:${total.kind}`}>
                        <td>
                          {section.totals.length > 1
                            ? `${total.kind === 'INCOME' ? 'Tulot' : 'Menot'} yhteensä`
                            : 'Yhteensä'}
                        </td>
                        <td className="right" data-label={columns.planned}>
                          {money(total.plannedCents, budget.currency)}
                        </td>
                        <td className="right" data-label={columns.used}>
                          {awaitingKitsas ? <Pending /> : money(total.usedCents, budget.currency)}
                        </td>
                        <td className="right" data-label={columns.prior}>
                          {awaitingKitsas ? <Pending /> : money(total.priorCents, budget.currency)}
                        </td>
                        <td
                          className={`right${
                            !awaitingKitsas && total.kind === 'EXPENSE' && total.usedCents > total.plannedCents
                              ? ' negative'
                              : ''
                          }`}
                          data-label={columns.remaining}
                        >
                          {awaitingKitsas ? <Pending /> : money(total.plannedCents - total.usedCents, budget.currency)}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="section-head">
            <h2>Viimeisimmät menot</h2>
            <span className="label">{closed ? 'koko kausi' : 'kuluva kausi'}</span>
          </div>
          {recentExpenses.length ? (
            <table>
              <tbody>
                {recentExpenses.slice(0, 8).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>
                        {/* Opens the same modal the table does, so a booking that
                            catches the eye leads straight to its line's history. */}
                        <CategoryDetail {...detailsByCategory[item.category]} label={item.description} />
                      </strong>
                      <br />
                      <span className="label">
                        {date(item.occurredOn)} · {item.category}
                      </span>
                      <AttachmentLinks files={item.attachments} />
                    </td>
                    <td className="right">{money(item.amountCents, budget.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : awaitingKitsas ? (
            <div className="empty">
              <Pending wide />
            </div>
          ) : (
            <div className="empty">
              {closed
                ? 'Tälle kaudelle ei ole kirjauksia Kitsaassa talousarvion tileillä.'
                : 'Kuluvalle kaudelle ei ole vielä haettu toteutuneita menoja Kitsaasta.'}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
