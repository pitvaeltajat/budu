/**
 * Strictly read-only Kitsas client. There are deliberately no POST, PUT, PATCH,
 * or DELETE methods in this module. Configure the exact vouchers endpoint only
 * after validating its shape against a non-production organization.
 */
const baseUrl = process.env.KITSAS_API_URL?.replace(/\/$/, '') || 'https://api.kitsas.fi/api';

export function kitsasIsConfigured() {
  return Boolean(process.env.KITSAS_TOKEN && process.env.KITSAS_EXPENSES_PATH);
}

export async function getKitsasExpenses(from: string, to: string): Promise<unknown> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas is not configured.');
  const path = process.env.KITSAS_EXPENSES_PATH!;
  if (!path.startsWith('/')) throw new Error('KITSAS_EXPENSES_PATH must start with /.');
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set('alkupvm', from);
  url.searchParams.set('loppupvm', to);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: process.env.KITSAS_TOKEN!, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Kitsas request failed (${response.status}).`);
  return response.json();
}

export async function getKitsasVoucher(id: number): Promise<unknown> {
  if (!kitsasIsConfigured()) throw new Error('Kitsas is not configured.');
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid Kitsas voucher id.');
  const path = process.env.KITSAS_EXPENSES_PATH!;
  const response = await fetch(`${baseUrl}${path}/${id}`, {
    method: 'GET',
    headers: { Authorization: process.env.KITSAS_TOKEN!, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Kitsas voucher request failed (${response.status}).`);
  return response.json();
}
