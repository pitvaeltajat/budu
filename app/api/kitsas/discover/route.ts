import { auth } from '@/lib/auth';
import { discoverKitsasHub } from '@/lib/kitsas-hub';

/** Only reads the Hub account catalogue. It never calls a Kitsas write method. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const username = process.env.KITSAS_HUB_USERNAME;
  const password = process.env.KITSAS_HUB_PASSWORD;
  if (!username || !password) return Response.json({ error: 'KitsasHub credentials are not configured.' }, { status: 409 });
  try {
    return Response.json(await discoverKitsasHub({ username, password, bookId: process.env.KITSAS_HUB_BOOK_ID }));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'KitsasHub discovery failed.' }, { status: 502 });
  }
}
