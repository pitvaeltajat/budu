'use server';

import { revalidatePath } from 'next/cache';
import { adminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { typedEuroCents } from '@/lib/euro';

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

  const updates: { id: string; plannedCents: number; kind: string }[] = [];
  for (const line of budget.lines) {
    const rawAmount = formData.get(`amount:${line.id}`);
    const rawKind = formData.get(`kind:${line.id}`);
    // A row the form did not submit keeps whatever it had.
    if (rawAmount === null && rawKind === null) continue;
    const plannedCents = rawAmount === null ? line.plannedCents : typedEuroCents(String(rawAmount));
    if (!Number.isFinite(plannedCents))
      return { error: `Rivin "${line.category}" summa ei kelpaa. Käytä esimerkiksi muotoa 1250,50.` };
    const kind = rawKind === null ? line.kind : String(rawKind);
    if (!KINDS.has(kind)) return { error: `Rivin "${line.category}" laji ei kelpaa.` };
    if (plannedCents !== line.plannedCents || kind !== line.kind) updates.push({ id: line.id, plannedCents, kind });
  }

  if (!updates.length && name === budget.name) return { ok: 'Ei muutoksia tallennettavaksi.' };

  await prisma.$transaction(async (tx) => {
    for (const { id, plannedCents, kind } of updates) {
      await tx.budgetLine.update({ where: { id }, data: { plannedCents, kind } });
    }
    // Touching the budget row is deliberate: `updatedAt` is what marks this the
    // active talousarvio, so an edit keeps it the one everybody sees.
    await tx.budget.update({ where: { id: budget.id }, data: { name } });
  });

  revalidatePath('/');
  revalidatePath('/admin');
  return { ok: `Tallennettu: ${updates.length} ${updates.length === 1 ? 'muutettu rivi' : 'muutettua riviä'}.` };
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
