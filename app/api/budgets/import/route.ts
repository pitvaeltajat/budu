import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseBudgetWorksheet } from '@/lib/budget-import';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.size)
    return Response.json({ error: 'Choose a non-empty CSV or Excel file.' }, { status: 400 });
  if (file.size > 5_000_000) return Response.json({ error: 'The file must be 5 MB or smaller.' }, { status: 413 });
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('The workbook has no worksheet.');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    const submittedName = String(form.get('name') ?? '').trim();
    const parsed = parseBudgetWorksheet(rows, submittedName);
    const budget = await prisma.budget.create({
      data: {
        name: parsed.name,
        currency: parsed.currency,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn,
        createdById: session.user.id,
        lines: { create: parsed.lines.map((row, sortOrder) => ({ ...row, sortOrder })) },
      },
    });
    /**
     * Realized expenses hang off the budget, so a freshly imported one starts
     * empty. Filling it is left to the dashboard, which asks for the sync while
     * showing the Kitsas-backed figures as pending: a large book takes tens of
     * seconds, and that is a poor thing to make an upload wait on.
     */
    return Response.json({ id: budget.id, lines: parsed.lines.length }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Could not read this file.' },
      { status: 400 },
    );
  }
}
