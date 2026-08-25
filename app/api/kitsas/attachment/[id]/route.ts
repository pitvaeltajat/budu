import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getKitsasAttachment } from '@/lib/kitsas';

/**
 * Serves a Kitsas attachment to a signed-in user. Kitsas answers 403 without
 * the cloud token, and that token also authorises writes, so it stays on the
 * server and the bytes are passed through here instead.
 */
export const runtime = 'nodejs';

const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf', 'text/csv'];

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Kirjautuminen vaaditaan.' }, { status: 401 });
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1)
    return Response.json({ error: 'Virheellinen liitetunnus.' }, { status: 400 });

  /**
   * Only serve attachments this user's own budgets actually reference. Without
   * this the route would be an open reader of every attachment in the book,
   * since the ids are small sequential integers.
   */
  const referenced = await prisma.expense.findFirst({
    where: {
      source: 'KITSAS',
      budget: { createdById: session.user.id },
      rawPayload: { path: ['attachments'], array_contains: [{ id }] },
    },
    select: { id: true },
  });
  if (!referenced) return Response.json({ error: 'Liitettä ei löytynyt.' }, { status: 404 });

  try {
    const file = await getKitsasAttachment(id);
    const contentType = ALLOWED.includes(file.contentType.split(';')[0].trim())
      ? file.contentType
      : 'application/octet-stream';
    return new Response(file.body, {
      headers: {
        'Content-Type': contentType,
        // The bytes never change once booked, but they are not public either.
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Liitteen haku epäonnistui.' },
      { status: 502 },
    );
  }
}
