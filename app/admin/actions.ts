'use server';

import { revalidatePath } from 'next/cache';
import { adminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { typedEuroCents } from '@/lib/euro';
import { duplicateAccounts, parseAccount, INVALID_ACCOUNT } from '@/lib/budget-mapping';

export type AdminState = { ok?: string; error?: string };

const KINDS = new Set(['EXPENSE', 'INCOME']);

/**
 * Saves the talousarvio's name and its rows' planned amounts and meno/tulo
 * classification.
 *
 * Reclassifying a row costs nothing beyond this write. `KitsasEntry` keeps both
 * the debit and the credit column of every booking, so which one a row counts
 * is decided when the dashboard renders; nothing copied from Kitsas has to be
 * discarded or fetched again.
 */
export async function saveBudget(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const { error } = await adminSession();
  if (error) return { error };

  const budgetId = String(formData.get('budgetId') ?? '');
  const budget = await prisma.budget.findUnique({ where: { id: budgetId }, include: { lines: true } });
  if (!budget) return { error: 'Talousarviota ei löytynyt.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { error: 'Talousarviolla pitää olla nimi.' };

  const updates: { id: string; plannedCents: number; kind: string; kitsasAccount: number | null }[] = [];
  for (const line of budget.lines) {
    const rawAmount = formData.get(`amount:${line.id}`);
    const rawKind = formData.get(`kind:${line.id}`);
    const rawAccount = formData.get(`account:${line.id}`);
    // A row the form did not submit keeps whatever it had.
    if (rawAmount === null && rawKind === null && rawAccount === null) continue;
    const plannedCents = rawAmount === null ? line.plannedCents : typedEuroCents(String(rawAmount));
    if (!Number.isFinite(plannedCents))
      return { error: `Rivin "${line.category}" summa ei kelpaa. Käytä esimerkiksi muotoa 1250,50.` };
    const kind = rawKind === null ? line.kind : String(rawKind);
    if (!KINDS.has(kind)) return { error: `Rivin "${line.category}" laji ei kelpaa.` };
    const kitsasAccount = rawAccount === null ? line.kitsasAccount : parseAccount(String(rawAccount));
    if (kitsasAccount === INVALID_ACCOUNT)
      return { error: `Rivin "${line.category}" tilinumero ei kelpaa. Anna Kitsaan tilinumero, esimerkiksi 4210.` };
    if (plannedCents !== line.plannedCents || kind !== line.kind || kitsasAccount !== line.kitsasAccount)
      updates.push({ id: line.id, plannedCents, kind, kitsasAccount });
  }

  /**
   * Two rows may not share an account. The dashboard joins a booking to a row
   * through a map keyed by account number, so a duplicate would not double the
   * figure — it would quietly drop whichever row lost the race, which is worse
   * than refusing the save.
   */
  const intended = new Map(budget.lines.map((line) => [line.id, line.kitsasAccount]));
  for (const update of updates) intended.set(update.id, update.kitsasAccount);
  const duplicates = duplicateAccounts([...intended.values()]);
  if (duplicates.length)
    return {
      error: `Sama Kitsas-tili on useammalla rivillä: ${duplicates.join(', ')}. Tili voi kuulua vain yhdelle riville.`,
    };

  if (!updates.length && name === budget.name) return { ok: 'Ei muutoksia tallennettavaksi.' };
  const remapped = updates.some((update) => {
    const line = budget.lines.find((candidate) => candidate.id === update.id);
    return line && update.kitsasAccount !== line.kitsasAccount;
  });

  await prisma.$transaction(async (tx) => {
    for (const { id, plannedCents, kind, kitsasAccount } of updates) {
      await tx.budgetLine.update({ where: { id }, data: { plannedCents, kind, kitsasAccount } });
    }
    /**
     * A changed account mapping makes the stored bookings incomplete: entries on
     * the newly mapped account were discarded by every sync so far, and no
     * amount of re-rendering will bring them back. Dropping this budget's sync
     * runs is what puts the dashboard into its pending state, so it fetches
     * again on the next load instead of showing a figure that is missing the
     * very money the remap was for.
     */
    if (remapped) {
      await tx.syncRun.deleteMany({ where: { budgetId: budget.id } });
      await tx.kitsasVoucherState.deleteMany({ where: { budgetId: budget.id } });
    }
    // Touching the budget row is deliberate: `updatedAt` is what marks this the
    // active talousarvio, so an edit keeps it the one everybody sees.
    await tx.budget.update({ where: { id: budget.id }, data: { name } });
  });

  revalidatePath('/');
  revalidatePath('/admin');
  const saved = `Tallennettu: ${updates.length} ${updates.length === 1 ? 'muutettu rivi' : 'muutettua riviä'}.`;
  return { ok: remapped ? `${saved} Tilikartta muuttui, joten kirjaukset haetaan Kitsaasta uudelleen.` : saved };
}

/**
 * Removes a budget outright, cascading its lines, sync runs and voucher state.
 * The bookings copied from Kitsas survive: they belong to the book rather than
 * to any budget, and another budget may well be reading the same accounts.
 * Nothing in Kitsas is touched. The last budget is kept, because deleting it
 * would leave the whole organisation looking at the empty state.
 */
export async function deleteBudget(_previous: AdminState, formData: FormData): Promise<AdminState> {
  const { error } = await adminSession();
  if (error) return { error };

  const id = String(formData.get('budgetId') ?? '');
  const budget = await prisma.budget.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!budget) return { error: 'Talousarviota ei löytynyt.' };
  if ((await prisma.budget.count()) <= 1) return { error: 'Viimeistä talousarviota ei voi poistaa.' };

  await prisma.budget.delete({ where: { id: budget.id } });
  revalidatePath('/');
  revalidatePath('/admin');
  return { ok: `Poistettu: ${budget.name}.` };
}
