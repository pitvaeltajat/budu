/**
 * Rebuilds vouchers from the two bulk endpoints, so the sync never has to ask
 * Kitsas about a voucher one at a time.
 *
 * `/viennit` returns every entry in a range, each carrying its voucher as
 * `tosite`. `/liitteet` returns every attachment in the same range — but with no
 * voucher id on it, only `(pvm, sarja, tunniste)`, which is why the join here
 * exists rather than a lookup by id. That triple was checked against the live
 * book before this was relied on: 929 of 929 vouchers carrying attachments
 * matched exactly, with no key claimed by two vouchers and no disagreement with
 * the per-voucher detail the sync used to read.
 *
 * Pure, so the matching can be tested without a network or a database.
 */

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const asNumber = (value: unknown) =>
  typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;

/** The voucher a batch of entries belongs to, in the shape the sync already reads. */
export type BulkVoucher = { id: number; pvm: string; viennit: unknown[]; liitteet: unknown[] };

/**
 * The only handle an attachment offers on its voucher. A date alone is not
 * enough — a book has many vouchers a day — and `tunniste` restarts per series,
 * so the series has to be part of the key even when it is usually null.
 */
export function voucherFileKey(pvm: unknown, sarja: unknown, tunniste: unknown) {
  const day = typeof pvm === 'string' ? pvm.slice(0, 10) : '';
  return `${day}|${sarja ?? ''}|${asNumber(tunniste)}`;
}

/**
 * Groups entries by voucher and hangs each voucher's attachments off it.
 *
 * An entry whose `tosite` carries no usable id is dropped: it cannot be keyed,
 * and the sync stores entries by `(voucherId, entryId)`.
 */
export function vouchersFromEntries(entries: unknown, attachments: unknown): Map<number, BulkVoucher> {
  const filesByKey = new Map<string, unknown[]>();
  for (const raw of Array.isArray(attachments) ? attachments : []) {
    const file = asRecord(raw);
    if (!file) continue;
    const key = voucherFileKey(file.pvm, file.sarja, file.tunniste);
    const known = filesByKey.get(key);
    if (known) known.push(file);
    else filesByKey.set(key, [file]);
  }

  const vouchers = new Map<number, BulkVoucher>();
  for (const raw of Array.isArray(entries) ? entries : []) {
    const entry = asRecord(raw);
    const voucher = asRecord(entry?.tosite);
    const id = asNumber(voucher?.id);
    if (!entry || !voucher || !Number.isSafeInteger(id)) continue;
    let known = vouchers.get(id);
    if (!known) {
      /**
       * Attachments are looked up once per voucher rather than per entry, and
       * only when the voucher says it has any — `liitteita` is on the voucher,
       * so a voucher claiming none needs no lookup at all.
       */
      const declared = asNumber(voucher.liitteita);
      const liitteet =
        Number.isFinite(declared) && declared > 0
          ? (filesByKey.get(voucherFileKey(voucher.pvm, voucher.sarja, voucher.tunniste)) ?? [])
          : [];
      known = {
        id,
        pvm: typeof voucher.pvm === 'string' ? voucher.pvm.slice(0, 10) : '',
        viennit: [],
        liitteet,
      };
      vouchers.set(id, known);
    }
    known.viennit.push(entry);
  }
  return vouchers;
}
