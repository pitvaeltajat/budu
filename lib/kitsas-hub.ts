import { KitsasService } from 'kitsas-library';

/**
 * Read-only wrapper around the current KitsasHub client. This is used for
 * discovering books and their account catalogue; voucher ingestion remains in
 * `kitsas.ts`, because the public Hub book interface does not expose reads for
 * vouchers or journal entries.
 */
export type KitsasHubCredentials = {
  username: string;
  password: string;
  bookId?: string;
  /** Hub host. Set to https://test-api.kitsas.fi to develop against the test server. */
  url?: string;
  mock?: boolean;
};

export type KitsasAccount = { number: string; name: string };

export const KITSAS_HUB_PRODUCTION_URL = 'https://api.kitsas.fi';
export const KITSAS_HUB_TEST_URL = 'https://test-api.kitsas.fi';

/**
 * The Hub host, defaulting to production. `kitsas-library` would otherwise fall
 * back to its own `KITSAS_URL` lookup, so resolve it here to keep the host an
 * explicit, inspectable choice.
 */
export function kitsasHubUrl() {
  return (process.env.KITSAS_HUB_URL || process.env.KITSAS_URL || KITSAS_HUB_PRODUCTION_URL).replace(/\/$/, '');
}

export async function discoverKitsasHub(credentials: KitsasHubCredentials) {
  const url = credentials.url?.replace(/\/$/, '') || kitsasHubUrl();
  const connection = await KitsasService.connect({ ...credentials, url });
  const books = await connection.getBooks();
  const selectedBookId = credentials.bookId || books[0]?.id;
  if (!selectedBookId) throw new Error('The Kitsas user has no accessible books.');
  const book = await connection.getBook(selectedBookId);
  const [accounts, dimensions, fiscalYears] = await Promise.all([
    book.getAccounts(),
    book.getDimensions(),
    book.getFiscalYears(),
  ]);
  return {
    hubUrl: url,
    userName: connection.getName(),
    books: books.map((item) => ({ id: item.id, name: item.name })),
    selectedBookId,
    accounts: accounts.map((account) => ({ number: account.number, name: account.name.fi })),
    dimensions,
    fiscalYears,
  };
}
