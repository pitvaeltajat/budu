import { auth } from '@/lib/auth';
import { discoverKitsasHub } from '@/lib/kitsas-hub';
import { getKitsasCloud, kitsasCloudIsConfigured } from '@/lib/kitsas-cloud';
import { getKitsasInit } from '@/lib/kitsas';

/** Only reads the Hub account catalogue and the cloud's own /init. It never calls a Kitsas write method. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: 'Sign in required.' }, { status: 401 });
  const username = process.env.KITSAS_HUB_USERNAME;
  const password = process.env.KITSAS_HUB_PASSWORD;
  if (!username || !password) return Response.json({ error: 'KitsasHub credentials are not configured.' }, { status: 409 });
  try {
    const hub = await discoverKitsasHub({ username, password, bookId: process.env.KITSAS_HUB_BOOK_ID, url: process.env.KITSAS_HUB_URL });
    return Response.json({ ...hub, cloud: await describeCloud() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'KitsasHub discovery failed.' }, { status: 502 });
  }
}

/**
 * Best-effort report on the legacy cloud backend. A failure here is reported
 * rather than thrown: Hub discovery is useful on its own, and this block exists
 * to make a broken cloud configuration visible.
 */
async function describeCloud() {
  if (!kitsasCloudIsConfigured()) return { configured: false as const };
  try {
    const cloud = await getKitsasCloud();
    const reachable = await getKitsasInit().then(() => true).catch(() => false);
    return { configured: true as const, id: cloud.id, name: cloud.name, url: cloud.url, reachable };
  } catch (error) {
    return { configured: true as const, error: error instanceof Error ? error.message : 'Kitsas cloud login failed.' };
  }
}
