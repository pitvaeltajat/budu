import assert from 'node:assert/strict';
import test from 'node:test';
import { takeRecords, flushRecords, type NdjsonBuffer } from '../lib/ndjson.ts';

const fresh = (): NdjsonBuffer => ({ rest: '' });

test('several records in one chunk all come out', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"a":1}\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.equal(buffer.rest, '');
});

test('a record split across chunks is not lost', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"fetch'), []);
  assert.deepEqual(takeRecords(buffer, 'ed":7}\n'), [{ fetched: 7 }]);
});

test('a chunk ending mid-record keeps the tail for the next one', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"a":1}\n{"a":'), [{ a: 1 }]);
  assert.equal(buffer.rest, '{"a":');
  assert.deepEqual(takeRecords(buffer, '2}\n'), [{ a: 2 }]);
});

test('a stream ending without a trailing newline still yields its last record', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"a":1}\n{"a":2}'), [{ a: 1 }]);
  assert.deepEqual(flushRecords(buffer), [{ a: 2 }]);
  assert.equal(buffer.rest, '');
});

test('nothing buffered flushes to nothing', () => {
  assert.deepEqual(flushRecords(fresh()), []);
});

test('an unreadable line is skipped rather than abandoning the run', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"a":1}\nnot json\n{"a":3}\n'), [{ a: 1 }, { a: 3 }]);
});

test('blank lines between records are ignored', () => {
  const buffer = fresh();
  assert.deepEqual(takeRecords(buffer, '{"a":1}\n\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
});
