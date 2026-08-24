import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Deletes one of the caller's own budgets. Lines, expenses, sync runs and
 * voucher state cascade with it; nothing in Kitsas is touched.
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Kirjautuminen vaaditaan.' }, { status: 401 });
  const { id } = await context.params;
  const budget = await prisma.budget.findFirst({ where: { id, createdById: session.user.id }, select: { id: true, name: true } });
  if (!budget) return Response.json({ error: 'Talousarviota ei löytynyt.' }, { status: 404 });
  const remaining = await prisma.budget.count({ where: { createdById: session.user.id } });
  if (remaining <= 1) return Response.json({ error: 'Viimeistä talousarviota ei voi poistaa.' }, { status: 409 });
  await prisma.budget.delete({ where: { id: budget.id } });
  return Response.json({ deleted: budget.id, name: budget.name });
}
