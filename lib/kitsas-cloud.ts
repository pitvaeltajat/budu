import { kitsasHubUrl } from './kitsas-hub';

/**
 * Resolves the legacy per-book cloud backend (URL + token) at runtime.
 *
 * This module contains the one and only POST in the Kitsas integration, and it
 * is an authentication call, not a data mutation: the compatibility login at
 * `POST {hub}/login` returns `clouds[]`, each entry carrying `id` (the cloudid),
 * `url`, and `token`. Everything that touches bookkeeping data stays in
 * `kitsas.ts` and is GET-only.
 *
 * Hand-configuring KITSAS_API_URL and KITSAS_TOKEN still works and takes
 * precedence; it is the escape hatch when the cloud URL is known already.
 */
export type KitsasCloud = { id: number; name: string; url: string; token: string };

type CompatibilityCloud = { id?: unknown; name?: unknown; url?: unknown; token?: unknown; active?: unknown };
type CompatibilityLogin = { clouds?: unknown };

/** Cloud tokens carry no documented lifetime, so re-login on a conservative interval. */
const CACHE_TTL_MS = 10 * 60 * 1000;
let cached: { cloud: KitsasCloud; expiresAt: number } | null = null;

export function kitsasCloudIsConfigured() {
  const manual = Boolean(process.env.KITSAS_API_URL && process.env.KITSAS_TOKEN);
  const hub = Boolean(process.env.KITSAS_HUB_USERNAME && process.env.KITSAS_HUB_PASSWORD);
  return manual || hub;
}

/** Discards the cached cloud token. Exported for tests and for retry-after-401 paths. */
export function resetKitsasCloudCache() {
  cached = null;
}

async function loginToCloud(): Promise<KitsasCloud> {
  const email = process.env.KITSAS_HUB_USERNAME;
  const password = process.env.KITSAS_HUB_PASSWORD;
  if (!email || !password) throw new Error('Kitsas credentials are not configured.');
  const response = await fetch(`${kitsasHubUrl()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password, application: 'Budu' }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Kitsas login failed (${response.status}).`);
  const body = (await response.json()) as CompatibilityLogin;
  const clouds = Array.isArray(body.clouds) ? (body.clouds as CompatibilityCloud[]) : [];
  const usable = clouds.filter((cloud) => typeof cloud.url === 'string' && cloud.url && typeof cloud.token === 'string' && cloud.token);
  if (!usable.length) throw new Error('The Kitsas user has no accessible clouds.');
  const wanted = process.env.KITSAS_CLOUD_ID;
  const selected = wanted ? usable.find((cloud) => String(cloud.id) === wanted) : usable.find((cloud) => cloud.active !== false) || usable[0];
  if (!selected) throw new Error(`Kitsas cloud ${wanted} is not accessible to this user.`);
  return {
    id: Number(selected.id),
    name: typeof selected.name === 'string' ? selected.name : `Cloud ${selected.id}`,
    url: (selected.url as string).replace(/\/$/, ''),
    token: selected.token as string,
  };
}

export async function getKitsasCloud(): Promise<KitsasCloud> {
  const manualUrl = process.env.KITSAS_API_URL?.replace(/\/$/, '');
  const manualToken = process.env.KITSAS_TOKEN;
  if (manualUrl && manualToken) {
    return { id: Number(process.env.KITSAS_CLOUD_ID) || 0, name: 'Configured cloud', url: manualUrl, token: manualToken };
  }
  if (cached && cached.expiresAt > Date.now()) return cached.cloud;
  const cloud = await loginToCloud();
  cached = { cloud, expiresAt: Date.now() + CACHE_TTL_MS };
  return cloud;
}
