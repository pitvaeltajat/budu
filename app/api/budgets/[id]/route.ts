import { adminSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Deletes a budget. Lines, sync runs and voucher state cascade with it; the
 * bookings copied from Kitsas do not, because they belong to the book rather
 * than to a budget. Nothing in Kitsas is touched. The budget is shared across
 * the organisation, so deleting it takes it away from everyone — admins only.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { error, status } = await adminSession();
  if (error) return Response.json({ error }, { status });
  const { id } = await context.params;
  const budget = await prisma.budget.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!budget) return Response.json({ error: 'Talousarviota ei löytynyt.' }, { status: 404 });
  const remaining = await prisma.budget.count();
  if (remaining <= 1) return Response.json({ error: 'Viimeistä talousarviota ei voi poistaa.' }, { status: 409 });
  await prisma.budget.delete({ where: { id: budget.id } });
  return Response.json({ deleted: budget.id, name: budget.name });
}
