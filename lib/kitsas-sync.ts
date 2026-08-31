import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getKitsasAttachments,
  getKitsasEntries,
  getKitsasExpenses,
  getKitsasInit,
  kitsasIsConfigured,
} from '@/lib/kitsas';
import { vouchersFromEntries, type BulkVoucher } from '@/lib/kitsas-vouchers';

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
  /** Ranges actually read from Kitsas, after the shared cache. Three requests each. */
  fetched: number;
  imported: number;
  pruned: number;
  /** P&L accounts carrying money that this budget maps nothing to. Only a full sync sets it. */
  unmapped: number;
  ms: number;
};

type VoucherListItem = { id?: unknown; pvm?: unknown; otsikko?: unknown; summa?: unknown };
type VoucherEntry = {
  id?: unknown;
  pvm?: unknown;
  tili?: unknown;
  selite?: unknown;
  debet?: unknown;
  kredit?: unknown;
};
export type StoredAttachment = { id: number; name: string; type: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const asNumber = (value: unknown) =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
const asText = (value: unknown) => (typeof value === 'string' ? value : '');
/** One side of an entry in cents. An absent side parses as NaN and counts as nothing. */
const centsOf = (value: unknown) => {
  const amount = asNumber(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
};

/**
 * Where the tuloslaskelma starts in the Finnish chart of accounts. Below this
 * are vastaavaa and vastattavaa — the bank account, receivables, payables — and
 * no talousarvio ever maps them, so reporting them as unmapped would bury the
 * accounts that genuinely are missing under noise that is working as intended.
 */
const PROFIT_AND_LOSS_FROM = 3000;

type UnmappedTotals = { entries: number; debetCents: number; kreditCents: number };

/**
 * Account names, read once per sync from the book's own /init. Without them the
 * unmapped list is a column of bare numbers, which is exactly the thing nobody
 * can act on. A failure here is not worth failing a sync over.
 */
async function accountNames(): Promise<Map<number, string>> {
  try {
    const init = asRecord(await getKitsasInit());
    const accounts = Array.isArray(init?.tilit) ? init.tilit : [];
    return new Map(
      accounts
        .map((raw) => asRecord(raw))
        .filter((account): account is Record<string, unknown> => Boolean(account))
        .map((account) => [asNumber(account.numero), asText(asRecord(account.nimi)?.fi).trim()] as const)
        .filter(([number, name]) => Number.isSafeInteger(number) && name),
    );
  } catch {
    return new Map();
  }
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
 * One range's rebuilt vouchers, shared across budgets in a single run and keyed
 * by the range they came from. Every budget reads the same book, so two budgets
 * covering the same year would otherwise ask Kitsas for it twice.
 */
export type VoucherCache = Map<string, Map<number, BulkVoucher>>;

const rangeKey = (range: { from: string; to: string }) => `${range.from}|${range.to}`;

/**
 * Progress worth showing while a sync runs. Reading from Kitsas is now three
 * requests per range rather than one per voucher, so what takes the time is
 * writing the entries — and that is what the count follows.
 */
export type SyncProgress =
  { type: 'listed'; listed: number; pending: number } | { type: 'progress'; fetched: number; pending: number };

/**
 * Writes are batched rather than awaited one at a time. Each upsert was its own
 * round trip to a database in another data centre, and a year of this book is
 * some two thousand of them; a batch is one round trip for the lot.
 */
const WRITE_BATCH = 250;

async function writeInBatches(operations: Prisma.PrismaPromise<unknown>[], onBatch?: (written: number) => void) {
  for (let index = 0; index < operations.length; index += WRITE_BATCH) {
    await prisma.$transaction(operations.slice(index, index + WRITE_BATCH));
    onBatch?.(Math.min(index + WRITE_BATCH, operations.length));
  }
}

export async function syncBudget(
  budgetId: string,
  mode: SyncMode,
  cache?: VoucherCache,
  onProgress?: (progress: SyncProgress) => void,
): Promise<SyncOutcome> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas has not been configured.');
  const startedAt = Date.now();
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { lines: true } });
  if (!budget) throw new Error('Budget not found.');
  // A set, not a map to the lines: nothing in the sync reads a line any more.
  // Which side of an entry counts, and under which heading it appears, are the
  // budget's business and are resolved when the dashboard renders.
  const accounts = new Set(
    budget.lines.map((line) => line.kitsasAccount).filter((account): account is number => account !== null),
  );
  if (!accounts.size) throw new Error('Add an account column to the budget before syncing Kitsas.');

  const ranges = syncRanges(budget.startsOn, budget.endsOn, new Date());
  const sync = await prisma.syncRun.create({ data: { budgetId: budget.id, source: 'KITSAS', status: 'RUNNING' } });

  try {
    const listed: { id: number; otsikko: string; signature: string }[] = [];
    for (const range of ranges) {
      const list = await getKitsasExpenses(range.from, range.to);
      if (!Array.isArray(list)) throw new Error('Kitsas voucher list had an unexpected response shape.');
      for (const raw of list as VoucherListItem[]) {
        const id = asNumber(raw.id);
        if (!Number.isSafeInteger(id)) continue;
        listed.push({
          id,
          otsikko: asText(raw.otsikko),
          signature: `${asText(raw.summa)}|${asText(raw.pvm)}|${asText(raw.otsikko)}`,
        });
      }
    }
    // Both ranges can return the same voucher when a budget period spans a year boundary.
    const unique = new Map(listed.map((item) => [item.id, item]));

    const known = new Map(
      (await prisma.kitsasVoucherState.findMany({ where: { budgetId: budget.id } })).map((row) => [
        row.voucherId,
        row.signature,
      ]),
    );
    const pending = [...unique.values()].filter((item) => mode === 'full' || known.get(item.id) !== item.signature);
    onProgress?.({ type: 'listed', listed: unique.size, pending: pending.length });

    let imported = 0;
    let fetchedFromKitsas = 0;
    /** Accounts seen carrying money that this budget maps nothing to. */
    const unmapped = new Map<number, UnmappedTotals>();

    /**
     * Every entry for both ranges, in three requests each instead of one per
     * voucher. Shared across budgets in a run, because two budgets covering the
     * same year would otherwise ask Kitsas for it twice.
     */
    const byVoucher = new Map<number, BulkVoucher>();
    for (const range of ranges) {
      const key = rangeKey(range);
      let rebuilt: Map<number, BulkVoucher> | undefined = cache?.get(key);
      if (!rebuilt) {
        const [entries, files] = await Promise.all([
          getKitsasEntries(range.from, range.to),
          getKitsasAttachments(range.from, range.to),
        ]);
        if (!Array.isArray(entries)) throw new Error('Kitsas entry list had an unexpected response shape.');
        rebuilt = vouchersFromEntries(entries, files);
        fetchedFromKitsas++;
        cache?.set(key, rebuilt);
      }
      for (const [id, voucher] of rebuilt) byVoucher.set(id, voucher);
    }

    /** Upserts are collected and written in batches; see writeInBatches. */
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const item of pending) {
      const voucher = byVoucher.get(item.id);
      // Listed but carrying no entries in the range — nothing to store, and the
      // voucher state below still records that it was seen.
      const entries = voucher?.viennit ?? [];
      /**
       * The bytes stay in Kitsas; only the reference is stored, and it is served
       * through an authenticated route because the endpoint answers 403 without
       * the cloud token.
       */
      const attachments: StoredAttachment[] = (voucher?.liitteet ?? ([] as unknown[]))
        .map((raw: unknown) => asRecord(raw))
        .filter((file): file is Record<string, unknown> => Boolean(file))
        .map((file) => ({ id: asNumber(file.id), name: asText(file.nimi), type: asText(file.tyyppi) }))
        .filter((file) => Number.isSafeInteger(file.id) && file.id > 0);
      for (const rawEntry of entries) {
        const entry = asRecord(rawEntry) as VoucherEntry | null;
        if (!entry) continue;
        const account = asNumber(entry.tili);
        const entryId = asNumber(entry.id);
        if (!Number.isSafeInteger(account) || !Number.isSafeInteger(entryId)) continue;
        /**
         * Only accounts some budget line maps to are stored. This is the one
         * place the budget still narrows ingest, and it is a volume decision
         * rather than an interpretation: the book carries balance-sheet
         * accounts no talousarvio ever references.
         *
         * What is skipped is counted rather than forgotten. A budget whose
         * account numbers do not match the book's produces no error anywhere —
         * the sync succeeds and the dashboard simply omits the money — so the
         * skipped total is the only evidence that anything is wrong.
         */
        if (!accounts.has(account)) {
          if (account >= PROFIT_AND_LOSS_FROM) {
            const seen = unmapped.get(account) ?? { entries: 0, debetCents: 0, kreditCents: 0 };
            seen.entries += 1;
            seen.debetCents += centsOf(entry.debet);
            seen.kreditCents += centsOf(entry.kredit);
            unmapped.set(account, seen);
          }
          continue;
        }
        /**
         * Both sides are stored, so nothing here depends on how a budget line is
         * classified. A debit-side entry has no `kredit` key at all, so the
         * unused side parses as NaN and is recorded as zero.
         */
        const debetCents = centsOf(entry.debet);
        const kreditCents = centsOf(entry.kredit);
        // An entry with neither side carries no figure; that is what keeps the
        // bank contra entry out of the table when it maps to no budget account.
        if (debetCents <= 0 && kreditCents <= 0) continue;
        const occurredOn = typeof entry.pvm === 'string' ? entry.pvm.slice(0, 10) : voucher?.pvm || null;
        if (!occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) continue;
        // `/viennit` carries no voucher title, so the listing's otsikko — already
        // held for the signature — is the fallback it used to come from.
        const description = asText(entry.selite) || item.otsikko || `Voucher ${item.id}`;
        const fields = {
          occurredOn: new Date(`${occurredOn}T00:00:00.000Z`),
          account,
          description,
          debetCents,
          kreditCents,
          // Explicit null, not undefined: an attachment removed in Kitsas has to
          // clear the stored reference rather than leave the old one standing.
          rawPayload: attachments.length ? { attachments } : Prisma.DbNull,
        };
        writes.push(
          prisma.kitsasEntry.upsert({
            where: { voucherId_entryId: { voucherId: item.id, entryId } },
            update: fields,
            create: { voucherId: item.id, entryId, ...fields },
          }),
        );
        imported++;
      }
      writes.push(
        prisma.kitsasVoucherState.upsert({
          where: { budgetId_voucherId: { budgetId: budget.id, voucherId: item.id } },
          update: { signature: item.signature },
          create: { budgetId: budget.id, voucherId: item.id, signature: item.signature },
        }),
      );
    }

    await writeInBatches(writes, (written) =>
      // Reported against the write total, which is now what the wait is made of.
      onProgress?.({ type: 'progress', fetched: written, pending: writes.length }),
    );

    /**
     * Replaced wholesale rather than upserted: an account that has since been
     * mapped, or that no longer carries anything in the period, has to leave the
     * list. Only a full sync may do this — an incremental run looks at the
     * vouchers that changed, so the accounts it did not see are not evidence of
     * anything, and rewriting the list from them would empty it every night.
     */
    if (mode === 'full') {
      const names = unmapped.size ? await accountNames() : new Map<number, string>();
      await prisma.$transaction([
        prisma.kitsasUnmappedAccount.deleteMany({ where: { budgetId: budget.id } }),
        prisma.kitsasUnmappedAccount.createMany({
          data: [...unmapped.entries()].map(([account, totals]) => ({
            budgetId: budget.id,
            account,
            name: names.get(account) ?? '',
            ...totals,
          })),
        }),
      ]);
    }

    /**
     * Deletions are visible in the list alone, so pruning costs nothing extra
     * and happens in both modes. The list covers exactly the ranges this budget
     * tracks, and those ranges derive from the budget's own period, so a known
     * voucher missing from it has genuinely gone.
     *
     * Entries are pruned by voucher id across the whole table, not per budget:
     * a voucher deleted in Kitsas is deleted for every budget that reads the
     * same book. If its date merely moved out of this budget's ranges, whichever
     * budget covers the new date restores it on its next run.
     */
    let pruned = 0;
    {
      const live = new Set(unique.keys());
      const stale = [...known.keys()].filter((id) => !live.has(id));
      if (stale.length) {
        const removed = await prisma.kitsasEntry.deleteMany({
          where: { voucherId: { in: stale } },
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
        detail: `${mode}: listed ${unique.size}, changed ${pending.length}, fetched ${fetchedFromKitsas}, pruned ${pruned}, unmapped ${unmapped.size}, ${ms}ms`,
        completedAt: new Date(),
      },
    });
    return {
      budgetId: budget.id,
      mode,
      listed: unique.size,
      changed: pending.length,
      fetched: fetchedFromKitsas,
      imported,
      pruned,
      unmapped: unmapped.size,
      ms,
    };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: sync.id },
      data: {
        status: 'FAILED',
        detail: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
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
