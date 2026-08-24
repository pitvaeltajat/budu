import assert from 'node:assert/strict';
import test from 'node:test';
import { KitsasService } from 'kitsas-library';

test('KitsasHub mock supplies a read-only book and account catalogue', async () => {
  const connection = await KitsasService.connect({
    username: 'test@kitsas.fi',
    password: 'Test+12345',
    mock: true,
  });
  assert.equal(connection.getName(), 'Test User');
  const books = await connection.getBooks();
  assert.ok(books.length > 0);
  const book = await connection.getBook(books[0].id);
  assert.ok((await book.getAccounts()).length > 0);
  assert.ok(Array.isArray(await book.getDimensions()));
  assert.ok(Array.isArray(await book.getFiscalYears()));
});
