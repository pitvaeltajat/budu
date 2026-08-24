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
  mock?: boolean;
};

export type KitsasAccount = { number: string; name: string };

export async function discoverKitsasHub(credentials: KitsasHubCredentials) {
  const connection = await KitsasService.connect(credentials);
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
    userName: connection.getName(),
    books: books.map((item) => ({ id: item.id, name: item.name })),
    selectedBookId,
    accounts: accounts.map((account) => ({ number: account.number, name: account.name.fi })),
    dimensions,
    fiscalYears,
  };
}
