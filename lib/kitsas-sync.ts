import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getKitsasExpenses, getKitsasVoucher, kitsasIsConfigured } from '@/lib/kitsas';

/**
 * Kitsas offers no modified-since filter and no change feed — `muokattu` is
 * accepted and silently ignored, and /loki and /muutokset are absent from its
 * RAML definition. What it does offer is a cheap list endpoint carrying each
 * voucher's id and total, so an incremental sync diffs that list against the
 * signatures recorded by the previous run and fetches detail only for vouchers
 * that are new or whose total, date, or title moved.
 *
 * The blind spot is an edit that leaves all three unchanged — a corrected
 * description, or an entry moved between accounts. The daily full sync exists
 * to close it.
 */
export type SyncMode = 'incremental' | 'full';

export type SyncOutcome = {
  budgetId: string;
  mode: SyncMode;
  listed: number;
  /** Vouchers whose list signature moved. */
  changed: number;
  /** Voucher details actually requested from Kitsas, after the shared cache. */
  fetched: number;
  imported: number;
  pruned: number;
  ms: number;
};

type VoucherListItem = { id?: unknown; pvm?: unknown; otsikko?: unknown; summa?: unknown };
type VoucherEntry = { id?: unknown; pvm?: unknown; tili?: unknown; selite?: unknown; debet?: unknown; kredit?: unknown };
type Voucher = { id?: unknown; pvm?: unknown; otsikko?: unknown; viennit?: unknown; liitteet?: unknown };
export type StoredAttachment = { id: number; name: string; type: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const asNumber = (value: unknown) =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
const asText = (value: unknown) => (typeof value === 'string' ? value : '');

/** Detail fetches are the expensive part; a small pool keeps Kitsas from being hammered. */
async function mapPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Shifting a date by a year lands on Mar 1 when the source is Feb 29, so pin the
 * day-of-month back afterwards and let the month clamp instead.
 */
function shiftYear(date: Date, years: number) {
  const shifted = new Date(date);
  const day = shifted.getUTCDate();
  shifted.setUTCFullYear(shifted.getUTCFullYear() + years);
  if (shifted.getUTCDate() !== day) shifted.setUTCDate(0);
  return shifted;
}

/**
 * Two ranges: the current period up to today, and the whole of the previous
 * period. The prior year is fetched in full rather than to the same date,
 * because the chart uses a completed year to show where the current one is
 * heading. The table still compares like-for-like; that narrowing happens at
 * render time, on data we already hold.
 */
export function syncRanges(startsOn: Date | null, endsOn: Date | null, now: Date) {
  const start = startsOn || new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const periodEnd = endsOn || new Date(Date.UTC(start.getUTCFullYear(), 11, 31));
  const end = periodEnd < now ? periodEnd : now;
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return [
    { from: iso(start), to: iso(end) },
    { from: iso(shiftYear(start, -1)), to: iso(shiftYear(periodEnd, -1)) },
  ];
}

/**
 * Voucher detail shared across budgets in one run. Every budget reads the same
 * Kitsas book, so fetching a voucher once per budget would multiply the load on
 * their server by the number of budgets for no new information.
 */
export type VoucherCache = Map<number, unknown>;

export async function syncBudget(budgetId: string, mode: SyncMode, cache?: VoucherCache): Promise<SyncOutcome> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas has not been configured.');
  const startedAt = Date.now();
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { lines: true } });
  if (!budget) throw new Error('Budget not found.');
  const accounts = new Map(
    budget.lines.filter((line) => line.kitsasAccount !== null).map((line) => [line.kitsasAccount!, line]),
  );
  if (!accounts.size) throw new Error('Add an account column to the budget before syncing Kitsas.');

  const ranges = syncRanges(budget.startsOn, budget.endsOn, new Date());
  const sync = await prisma.syncRun.create({ data: { budgetId: budget.id, source: 'KITSAS', status: 'RUNNING' } });

  try {
    const listed: { id: number; signature: string }[] = [];
    for (const range of ranges) {
      const list = await getKitsasExpenses(range.from, range.to);
      if (!Array.isArray(list)) throw new Error('Kitsas voucher list had an unexpected response shape.');
      for (const raw of list as VoucherListItem[]) {
        const id = asNumber(raw.id);
        if (!Number.isSafeInteger(id)) continue;
        listed.push({ id, signature: `${asText(raw.summa)}|${asText(raw.pvm)}|${asText(raw.otsikko)}` });
      }
    }
    // Both ranges can return the same voucher when a budget period spans a year boundary.
    const unique = new Map(listed.map((item) => [item.id, item]));

    const known = new Map(
      (await prisma.kitsasVoucherState.findMany({ where: { budgetId: budget.id } })).map((row) => [row.voucherId, row.signature]),
    );
    const pending = [...unique.values()].filter((item) => mode === 'full' || known.get(item.id) !== item.signature);

    let imported = 0;
    let fetchedFromKitsas = 0;
    await mapPool(pending, 4, async (item) => {
      let detail = cache?.get(item.id);
      if (detail === undefined) {
        detail = await getKitsasVoucher(item.id);
        fetchedFromKitsas++;
        cache?.set(item.id, detail);
      }
      const voucher = asRecord(detail) as Voucher | null;
      if (!voucher || !Array.isArray(voucher.viennit)) return;
      /**
       * Attachment metadata rides along with the voucher detail we already
       * fetch. The bytes stay in Kitsas; only the reference is stored, and it
       * is served through an authenticated route because the endpoint answers
       * 403 without the cloud token.
       */
      const attachments: StoredAttachment[] = (Array.isArray(voucher.liitteet) ? voucher.liitteet : [])
        .map((raw) => asRecord(raw))
        .filter((file): file is Record<string, unknown> => Boolean(file))
        .map((file) => ({ id: asNumber(file.id), name: asText(file.nimi), type: asText(file.tyyppi) }))
        .filter((file) => Number.isSafeInteger(file.id) && file.id > 0);
      for (const rawEntry of voucher.viennit) {
        const entry = asRecord(rawEntry) as VoucherEntry | null;
        if (!entry) continue;
        const account = asNumber(entry.tili);
        const entryId = asNumber(entry.id);
        const line = accounts.get(account);
        const amount = line?.kind === 'INCOME' ? asNumber(entry.kredit) : asNumber(entry.debet);
        if (!line || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(entryId)) continue;
        const occurredOn = typeof entry.pvm === 'string' ? entry.pvm : typeof voucher.pvm === 'string' ? voucher.pvm : null;
        if (!occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) continue;
        const description = asText(entry.selite) || asText(voucher.otsikko) || `Voucher ${item.id}`;
        const fields = {
          occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
          description,
          category: line.category,
          kind: line.kind,
          amountCents: Math.round(amount * 100),
          // Explicit null, not undefined: an attachment removed in Kitsas has to
          // clear the stored reference rather than leave the old one standing.
          rawPayload: attachments.length ? { attachments } : Prisma.DbNull,
        };
        await prisma.expense.upsert({
          where: { budgetId_source_externalId: { budgetId: budget.id, source: 'KITSAS', externalId: `${item.id}:${entryId}` } },
          update: fields,
          create: { budgetId: budget.id, source: 'KITSAS', externalId: `${item.id}:${entryId}`, ...fields },
        });
        imported++;
      }
      await prisma.kitsasVoucherState.upsert({
        where: { budgetId_voucherId: { budgetId: budget.id, voucherId: item.id } },
        update: { signature: item.signature },
        create: { budgetId: budget.id, voucherId: item.id, signature: item.signature },
      });
    });

    /**
     * Deletions are visible in the list alone, so pruning costs nothing extra
     * and happens in both modes. The list covers exactly the ranges this budget
     * tracks, and those ranges derive from the budget's own period, so a known
     * voucher missing from it has genuinely gone.
     */
    let pruned = 0;
    {
      const live = new Set(unique.keys());
      const stale = [...known.keys()].filter((id) => !live.has(id));
      if (stale.length) {
        const removed = await prisma.expense.deleteMany({
          where: { budgetId: budget.id, source: 'KITSAS', OR: stale.map((id) => ({ externalId: { startsWith: `${id}:` } })) },
        });
        await prisma.kitsasVoucherState.deleteMany({ where: { budgetId: budget.id, voucherId: { in: stale } } });
        pruned = removed.count;
      }
    }

    const ms = Date.now() - startedAt;
    await prisma.syncRun.update({
      where: { id: sync.id },
      data: {
        status: 'COMPLETED',
        imported,
        detail: `${mode}: listed ${unique.size}, changed ${pending.length}, fetched ${fetchedFromKitsas}, pruned ${pruned}, ${ms}ms`,
        completedAt: new Date(),
      },
    });
    return { budgetId: budget.id, mode, listed: unique.size, changed: pending.length, fetched: fetchedFromKitsas, imported, pruned, ms };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: sync.id },
      data: { status: 'FAILED', detail: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() },
    });
    throw error;
  }
}

/** Every budget that has at least one Kitsas account mapped. */
export async function syncableBudgetIds() {
  const budgets = await prisma.budget.findMany({
    where: { lines: { some: { kitsasAccount: { not: null } } } },
    select: { id: true },
  });
  return budgets.map((budget) => budget.id);
}
