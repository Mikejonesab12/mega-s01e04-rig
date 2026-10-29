import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const at = '2026-10-28T23:00:00+01:00';
const event = { at, job: 'test/job', status: 'ok', owner: 'rook' };
let runsDir: string;

beforeEach(() => { runsDir = mkdtempSync(join(tmpdir(), 'rig-reader-')); });
afterEach(() => { rmSync(runsDir, { recursive: true, force: true }); });

function writeLines(lines: unknown[], ending = '\n'): void {
  writeFileSync(join(runsDir, `${night}.jsonl`), lines.map(line => JSON.stringify(line)).join('\n') + ending);
}

describe('readNight', () => {
  it('aggregates the read-only sample night into five sorted jobs and one bad line', () => {
    const digest = readNight('runs', night);
    expect(digest).toMatchObject({ night, badLines: 1, counts: { ok: 10, retry: 4, fail: 1 } });
    expect(digest?.rows.map(row => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest?.rows[0]).toEqual({
      job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
      firstTime: '2026-10-29T05:41:09+01:00', lastTime: '2026-10-29T05:41:09+01:00',
    });
    expect(digest?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503',
      firstTime: '2026-10-29T01:30:00+01:00', lastTime: '2026-10-29T01:37:00+01:00',
    });
    expect(digest?.rows[2]).toEqual({
      job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held',
      firstTime: '2026-10-28T23:00:06+01:00', lastTime: '2026-10-29T05:00:04+01:00',
    });
    expect(digest?.rows[3]).toMatchObject({ runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes a missing night from an existing empty file', () => {
    expect(readNight(runsDir, night)).toBeNull();
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    expect(readNight(runsDir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts malformed JSON and invalid events without dropping valid events', () => {
    const invalid = [null, [], 1, 'text', {}, { ...event, at: null }, { ...event, at: 'invalid' },
      { ...event, job: '' }, { ...event, job: 2 }, { ...event, status: 'unknown' },
      { ...event, owner: 3 }, { ...event, error: false }, { ...event, error: null }];
    const file = join(runsDir, `${night}.jsonl`);
    writeFileSync(file, '{broken\n' + invalid.map(value => JSON.stringify(value)).join('\n') + '\n' + JSON.stringify(event) + '\n');
    expect(readNight(runsDir, night)).toMatchObject({ badLines: invalid.length + 1, counts: { ok: 1, retry: 0, fail: 0 } });
    expect(readNight(runsDir, night)?.rows).toHaveLength(1);
  });

  it('retains missing and null owners and the last encountered error', () => {
    writeLines([
      { at, job: 'unowned', status: 'ok' },
      { ...event, status: 'retry', error: 'first error' },
      { ...event, status: 'fail', owner: null, error: 'last error' },
      { ...event, owner: null },
    ]);
    expect(readNight(runsDir, night)?.rows).toEqual([
      { job: 'test/job', owner: null, runs: 3, retries: 1, lastStatus: 'ok', lastError: 'last error', firstTime: at, lastTime: at },
      { job: 'unowned', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstTime: at, lastTime: at },
    ]);
  });

  it('preserves original timestamp offsets and file order even across out-of-order times', () => {
    const first = '2026-10-29T04:30:00.123+05:30';
    const last = '2026-10-28T03:00:00-07:00';
    writeLines([{ ...event, at: first }, { ...event, at: last, status: 'retry' }], '');
    expect(readNight(runsDir, night)?.rows[0]).toMatchObject({ firstTime: first, lastTime: last, lastStatus: 'retry' });
  });

  it('accepts CRLF records and counts interior blank lines, not the trailing terminator', () => {
    writeFileSync(join(runsDir, `${night}.jsonl`), JSON.stringify(event) + '\r\n\r\n' + JSON.stringify(event) + '\r\n');
    expect(readNight(runsDir, night)).toMatchObject({ badLines: 1, counts: { ok: 2, retry: 0, fail: 0 } });
  });

  it('rejects traversal and invalid calendar dates before reading a path', () => {
    const nested = join(runsDir, 'nested');
    mkdirSync(nested);
    writeLines([event]);
    expect(readNight(nested, `../${night}`)).toBeNull();
    for (const invalid of ['', '.', '..', `${night}/extra`, `${night}\0`, '2026-02-30', '2026-13-01', '2026-1-01']) {
      expect(readNight(runsDir, invalid)).toBeNull();
    }
    mkdirSync(join(runsDir, '2026-10-29.jsonl'));
    expect(readNight(runsDir, '2026-10-29')).toBeNull();
  });
});
