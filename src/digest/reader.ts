import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight } from './types.js';

interface RunEvent {
  at: string;
  job: string;
  status: DigestRow['lastStatus'];
  owner: string | null;
  error?: string;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
  if (!('job' in value) || typeof value.job !== 'string' || value.job.trim() === '') return null;
  if (!('status' in value) || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  const owner = 'owner' in value ? value.owner : null;
  if (owner !== null && typeof owner !== 'string') return null;
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at: value.at, job: value.job, status: value.status, owner, error };
}

function isNight(night: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return false;
  const date = new Date(`${night}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === night;
}

/** Summarize valid events in file order while retaining the log's original times. */
export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error &&
        (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EISDIR')) return null;
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, DigestRow>();
  const lines = source.split(/\r?\n/);
  // A line terminator ends the preceding record; it does not add an empty record.
  if (lines.at(-1) === '') lines.pop();
  for (const line of lines) {
    const event = parseEvent(line);
    if (!event) {
      digest.badLines += 1;
      continue;
    }
    digest.counts[event.status] += 1;
    const row = jobs.get(event.job);
    if (row) {
      row.owner = event.owner;
      row.runs += 1;
      row.retries += Number(event.status === 'retry');
      row.lastStatus = event.status;
      if (event.error !== undefined) row.lastError = event.error;
      row.lastTime = event.at;
    } else {
      jobs.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: Number(event.status === 'retry'),
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstTime: event.at,
        lastTime: event.at,
      });
    }
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
