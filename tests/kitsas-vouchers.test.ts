import assert from 'node:assert/strict';
import test from 'node:test';
import { vouchersFromEntries, voucherFileKey } from '../lib/kitsas-vouchers.ts';

const entry = (id: number, tili: number, tosite: Record<string, unknown>) => ({ id, tili, debet: '10.00', tosite });

test('entries are grouped by the voucher they belong to', () => {
  const vouchers = vouchersFromEntries(
    [
      entry(1, 4210, { id: 71, pvm: '2025-01-01', tunniste: 1, liitteita: 0 }),
      entry(2, 1910, { id: 71, pvm: '2025-01-01', tunniste: 1, liitteita: 0 }),
      entry(3, 4210, { id: 72, pvm: '2025-01-02', tunniste: 2, liitteita: 0 }),
    ],
    [],
  );
  assert.deepEqual([...vouchers.keys()], [71, 72]);
  assert.equal(vouchers.get(71)?.viennit.length, 2);
  assert.equal(vouchers.get(71)?.pvm, '2025-01-01');
});

test('an attachment is matched by date, series and running number', () => {
  const vouchers = vouchersFromEntries(
    [entry(1, 4210, { id: 71, pvm: '2025-01-01', sarja: null, tunniste: 1, liitteita: 1 })],
    [
      {
        pvm: '2025-01-01T00:00:00.000Z',
        sarja: null,
        tunniste: 1,
        id: 50,
        nimi: 'lasku.pdf',
        tyyppi: 'application/pdf',
      },
    ],
  );
  assert.deepEqual(vouchers.get(71)?.liitteet, [
    { pvm: '2025-01-01T00:00:00.000Z', sarja: null, tunniste: 1, id: 50, nimi: 'lasku.pdf', tyyppi: 'application/pdf' },
  ]);
});

test('a voucher declaring no attachments is given none, whatever the key would match', () => {
  // `liitteita` is on the voucher, so a voucher claiming none needs no lookup —
  // and must not inherit a file that happens to share its key.
  const vouchers = vouchersFromEntries(
    [entry(1, 4210, { id: 71, pvm: '2025-01-01', sarja: null, tunniste: 1, liitteita: 0 })],
    [{ pvm: '2025-01-01', sarja: null, tunniste: 1, id: 50, nimi: 'lasku.pdf' }],
  );
  assert.deepEqual(vouchers.get(71)?.liitteet, []);
});

test('several attachments on one voucher all come through', () => {
  const vouchers = vouchersFromEntries(
    [entry(1, 4210, { id: 71, pvm: '2025-03-04', sarja: null, tunniste: 9, liitteita: 2 })],
    [
      { pvm: '2025-03-04', sarja: null, tunniste: 9, id: 1 },
      { pvm: '2025-03-04', sarja: null, tunniste: 9, id: 2 },
      { pvm: '2025-03-04', sarja: null, tunniste: 8, id: 3 },
    ],
  );
  assert.deepEqual(
    vouchers.get(71)?.liitteet.map((f) => (f as { id: number }).id),
    [1, 2],
  );
});

test('the series is part of the key, since tunniste restarts per series', () => {
  assert.notEqual(voucherFileKey('2025-01-01', 'A', 1), voucherFileKey('2025-01-01', 'B', 1));
  assert.equal(voucherFileKey('2025-01-01T00:00:00.000Z', null, 1), voucherFileKey('2025-01-01', null, 1));
});

test('entries with no usable voucher id are dropped rather than grouped under NaN', () => {
  const vouchers = vouchersFromEntries(
    [
      { id: 1, tili: 4210, tosite: { pvm: '2025-01-01' } },
      { id: 2, tili: 4210 },
      entry(3, 4210, { id: 71, pvm: '2025-01-01', liitteita: 0 }),
    ],
    [],
  );
  assert.deepEqual([...vouchers.keys()], [71]);
});

test('a response that is not a list yields nothing rather than throwing', () => {
  assert.equal(vouchersFromEntries(null, null).size, 0);
  assert.equal(vouchersFromEntries({ error: 'nope' }, undefined).size, 0);
});
