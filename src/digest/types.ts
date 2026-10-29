/** One job's summary for a single night's run log. */
export interface DigestRow {
  job: string;
  owner: string | null;
  /** Number of valid events recorded for this job. */
  runs: number;
  /** Number of valid retry events recorded for this job. */
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstTime: string;
  lastTime: string;
}

/** Aggregated digest data for one night. */
export interface NightDigest {
  night: string;
  rows: DigestRow[];
  /** Number of input lines that could not be parsed as valid events. */
  badLines: number;
  /** Counts of valid source events, grouped by status. */
  counts: {
    ok: number;
    retry: number;
    fail: number;
  };
}

/** Synchronous reader contract. Returns null when the night's file is missing. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;

/**
 * Read and summarize one night's JSONL run log.
 *
 * A missing file returns null; an existing empty file returns a digest with no rows.
 */
export declare function readNight(runsDir: string, night: string): NightDigest | null;
