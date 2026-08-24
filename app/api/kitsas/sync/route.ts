import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getKitsasExpenses, getKitsasVoucher, kitsasIsConfigured } from '@/lib/kitsas';

type VoucherListItem = { id?: unknown };
type VoucherEntry = { id?: unknown; pvm?: unknown; tili?: unknown; selite?: unknown; debet?: unknown; kredit?: unknown };
type Voucher = { id?: unknown; pvm?: unknown; otsikko?: unknown; viennit?: unknown };

const asRecord = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const asNumber = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  if (!kitsasIsConfigured()) return Response.json({ error: 'Kitsas has not been configured.' }, { status: 409 });
  const budget = await prisma.budget.findFirst({ where: { createdById: session.user.id }, orderBy: { updatedAt: 'desc' }, include: { lines: true } });
  if (!budget) return Response.json({ error: 'Import a budget before syncing.' }, { status: 409 });
  const accounts = new Map(budget.lines.filter((line) => line.kitsasAccount !== null).map((line) => [line.kitsasAccount!, line]));
  if (!accounts.size) return Response.json({ error: 'Add an account column to the budget before syncing Kitsas.' }, { status: 409 });
  const startedAt = new Date(); const from = budget.startsOn?.toISOString().slice(0, 10) || `${startedAt.getUTCFullYear()}-01-01`; const to = budget.endsOn && budget.endsOn < startedAt ? budget.endsOn.toISOString().slice(0, 10) : startedAt.toISOString().slice(0, 10);
  const currentStart = new Date(`${from}T00:00:00.000Z`);
  const previousFrom = new Date(currentStart); previousFrom.setUTCFullYear(previousFrom.getUTCFullYear() - 1);
  const previousTo = new Date(`${to}T00:00:00.000Z`); previousTo.setUTCFullYear(previousTo.getUTCFullYear() - 1);
  const ranges = [{ from, to }, { from: previousFrom.toISOString().slice(0, 10), to: previousTo.toISOString().slice(0, 10) }];
  const sync = await prisma.syncRun.create({ data: { budgetId: budget.id, source: 'KITSAS', status: 'RUNNING' } });
  try {
    let imported = 0;
    for (const range of ranges) {
      const list = await getKitsasExpenses(range.from, range.to);
      if (!Array.isArray(list)) throw new Error('Kitsas voucher list had an unexpected response shape.');
      for (const item of list as VoucherListItem[]) {
      const voucherId = asNumber(item.id); if (!Number.isSafeInteger(voucherId)) continue;
      const response = await getKitsasVoucher(voucherId);
      const voucher = asRecord(response) as Voucher | null; if (!voucher || !Array.isArray(voucher.viennit)) continue;
      for (const rawEntry of voucher.viennit) {
        const entry = asRecord(rawEntry) as VoucherEntry | null; if (!entry) continue;
        const account = asNumber(entry.tili); const debit = asNumber(entry.debet); const credit = asNumber(entry.kredit); const entryId = asNumber(entry.id);
        const line = accounts.get(account);
        const amount = line?.kind === 'INCOME' ? credit : debit;
        if (!line || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(entryId)) continue;
        const occurredOn = typeof entry.pvm === 'string' ? entry.pvm : typeof voucher.pvm === 'string' ? voucher.pvm : null;
        if (!occurredOn || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) continue;
        await prisma.expense.upsert({
          where: { budgetId_source_externalId: { budgetId: budget.id, source: 'KITSAS', externalId: `${voucherId}:${entryId}` } },
          update: { occurredOn: new Date(`${occurredOn}T00:00:00.000Z`), description: typeof entry.selite === 'string' && entry.selite ? entry.selite : typeof voucher.otsikko === 'string' ? voucher.otsikko : `Voucher ${voucherId}`, category: line.category, kind: line.kind, amountCents: Math.round(amount * 100) },
          create: { budgetId: budget.id, source: 'KITSAS', externalId: `${voucherId}:${entryId}`, occurredOn: new Date(`${occurredOn}T00:00:00.000Z`), description: typeof entry.selite === 'string' && entry.selite ? entry.selite : typeof voucher.otsikko === 'string' ? voucher.otsikko : `Voucher ${voucherId}`, category: line.category, kind: line.kind, amountCents: Math.round(amount * 100) },
        });
        imported++;
      }
    }
    }
    await prisma.syncRun.update({ where: { id: sync.id }, data: { status: 'COMPLETED', imported, completedAt: new Date() } });
    return Response.redirect(new URL('/', request.url), 303);
  } catch (error) {
    await prisma.syncRun.update({ where: { id: sync.id }, data: { status: 'FAILED', detail: error instanceof Error ? error.message : 'Unknown error', completedAt: new Date() } });
    return Response.json({ error: 'Kitsas sync failed. No data was changed in Kitsas.' }, { status: 502 });
  }
}
