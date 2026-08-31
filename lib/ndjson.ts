/**
 * Newline-delimited JSON, split from a stream that knows nothing about record
 * boundaries. A chunk can carry half a line, several lines, or a line plus half
 * the next, so whatever follows the last newline has to be carried forward
 * rather than parsed — that is the whole reason this is not a `split('\n')`.
 *
 * Pure, and kept out of the component that uses it so it can be tested without
 * a stream or a browser.
 */
export type NdjsonBuffer = { rest: string };

/**
 * Consumes one chunk, returning every complete record it finished and keeping
 * the partial tail in `buffer`. Malformed lines are skipped rather than thrown:
 * one unreadable progress record should not abandon a sync that is still going.
 */
export function takeRecords<T>(buffer: NdjsonBuffer, chunk: string): T[] {
  const combined = buffer.rest + chunk;
  const lines = combined.split('\n');
  buffer.rest = lines.pop() ?? '';
  const records: T[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      // Not a complete record after all; drop it.
    }
  }
  return records;
}

/** The final record when the stream ends without a trailing newline. */
export function flushRecords<T>(buffer: NdjsonBuffer): T[] {
  const remaining = buffer.rest;
  buffer.rest = '';
  return takeRecords<T>({ rest: '' }, remaining ? `${remaining}\n` : '');
}
