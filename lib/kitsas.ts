import { getKitsasCloud, kitsasCloudIsConfigured } from './kitsas-cloud';

/**
 * Strictly read-only Kitsas client. There are deliberately no POST, PUT, PATCH,
 * or DELETE methods in this module. The cloud URL and token are resolved by
 * `kitsas-cloud.ts`, which holds the integration's only POST — a login, not a
 * data mutation.
 *
 * These endpoints live on the legacy per-book cloud backend, not on KitsasHub:
 * the documented Hub API exposes no voucher read.
 */
type Cloud = { url: string; token: string };

/** Kitsas expects `Bearer <jwt>`; tolerate a token that already carries a scheme. */
function authorization(token: string) {
  return /^(bearer|basic) /i.test(token) ? token : `Bearer ${token}`;
}

function expensesPath() {
  const path = process.env.KITSAS_EXPENSES_PATH;
  if (!path) throw new Error('KITSAS_EXPENSES_PATH must be set.');
  if (!path.startsWith('/')) throw new Error('KITSAS_EXPENSES_PATH must start with /.');
  return path;
}

async function readCloud(cloud: Cloud, path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${cloud.url}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authorization(cloud.token), Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Kitsas request to ${path} failed (${response.status}).`);
  return response.json();
}

export function kitsasIsConfigured() {
  return Boolean(process.env.KITSAS_EXPENSES_PATH) && kitsasCloudIsConfigured();
}

/**
 * `GET /init` is the cloud backend's own description of the book. Kitsas support
 * recommends it as the first call against a book, so it doubles as the
 * connectivity check for a configured cloud.
 */
export async function getKitsasInit(): Promise<unknown> {
  if (!kitsasCloudIsConfigured()) throw new Error('Kitsas is not configured.');
  return readCloud(await getKitsasCloud(), '/init');
}

export async function getKitsasExpenses(from: string, to: string): Promise<unknown> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas is not configured.');
  return readCloud(await getKitsasCloud(), expensesPath(), { alkupvm: from, loppupvm: to });
}

export type KitsasAttachment = { body: ArrayBuffer; contentType: string };

/**
 * Streams one attachment's bytes. The endpoint negotiates on Accept and rejects
 * `application/json` outright, so ask for the types it actually serves.
 */
export async function getKitsasAttachment(id: number): Promise<KitsasAttachment> {
  if (!kitsasCloudIsConfigured()) throw new Error('Kitsas is not configured.');
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid Kitsas attachment id.');
  const cloud = await getKitsasCloud();
  const response = await fetch(`${cloud.url}/liitteet/${id}`, {
    method: 'GET',
    headers: { Authorization: authorization(cloud.token), Accept: 'image/jpeg, image/png, application/pdf, text/csv' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Kitsas attachment request failed (${response.status}).`);
  return { body: await response.arrayBuffer(), contentType: response.headers.get('content-type') || 'application/octet-stream' };
}

export async function getKitsasVoucher(id: number): Promise<unknown> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas is not configured.');
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid Kitsas voucher id.');
  return readCloud(await getKitsasCloud(), `${expensesPath()}/${id}`);
}
