import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

const night = '2026-10-28';
const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};
const firstTime = '2026-10-28T23:00:00+01:00';
const lastTime = '2026-10-29T00:00:00-07:00';
let runsDir: string;

beforeEach(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

function writeNight(lines: string, date = night): void {
  writeFileSync(join(runsDir, `${date}.jsonl`), lines);
}

function app() {
  return createApp({ ...config, runsDir });
}

describe('digest routes', () => {
  it('serves the same sorted digest from the HTML page and JSON endpoint', async () => {
    writeNight([
      '{malformed line',
      JSON.stringify({ at: firstTime, job: 'a-job', status: 'fail', owner: null, error: 'quota <exceeded>' }),
      JSON.stringify({ at: firstTime, job: 'Z-job', status: 'retry', owner: 'rook', error: '<script>bad()</script>' }),
      JSON.stringify({ at: '2026-10-28T23:10:00+01:00', job: 'Z-job', status: 'retry', owner: 'rook' }),
      JSON.stringify({ at: '2026-10-28T23:20:00+01:00', job: 'Z-job', status: 'retry', owner: 'rook' }),
      JSON.stringify({ at: lastTime, job: 'Z-job', status: 'ok', owner: 'rook' }),
    ].join('\n'));

    const [pageRes, jsonRes] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);

    expect(pageRes.status).toBe(200);
    expect(pageRes.headers.get('content-type')).toContain('text/html');
    expect(jsonRes.status).toBe(200);
    expect(jsonRes.headers.get('content-type')).toContain('application/json');

    const expected = {
      night,
      rows: [
        {
          job: 'Z-job', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
          lastError: '<script>bad()</script>', firstTime, lastTime,
        },
        {
          job: 'a-job', owner: null, runs: 1, retries: 0, lastStatus: 'fail',
          lastError: 'quota <exceeded>', firstTime, lastTime: firstTime,
        },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 3, fail: 1 },
    };
    const json: unknown = await jsonRes.json();
    expect(json).toEqual(expected);

    const html = await pageRes.text();
    expect(html).toContain('<th>job</th>');
    expect(html).toContain('<th>owner</th>');
    expect(html).toContain('<th>runs</th>');
    expect(html).toContain('<th>retries</th>');
    expect(html).toContain('<th>last status</th>');
    expect(html).toContain('<th>last error</th>');
    expect(html).toContain('<th>first time</th>');
    expect(html).toContain('<th>last time</th>');
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('<td>—</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('<td>fail</td>');
    expect(html).toContain(firstTime);
    expect(html).toContain(lastTime);
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('quota &lt;exceeded&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<script\b/i);
    expect(html.indexOf('Z-job')).toBeLessThan(html.indexOf('a-job'));

    const warnedRetryRow = html.match(/<tr[^>]*>.*?Z-job.*?<\/tr>/s)?.[0];
    const failedRow = html.match(/<tr[^>]*>.*?a-job.*?<\/tr>/s)?.[0];
    expect(warnedRetryRow).toContain('<td class="warn">3</td>');
    expect(failedRow).toContain('<tr class="warn">');
  });

  it('returns 404 for a night that has no run file', async () => {
    const [pageRes, jsonRes] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);

    expect(pageRes.status).toBe(404);
    expect(jsonRes.status).toBe(404);
  });

  it('renders an existing empty night as nothing ran and returns an empty digest', async () => {
    writeNight('');

    const [pageRes, jsonRes] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);

    expect(pageRes.status).toBe(200);
    expect(await pageRes.text()).toContain('nothing ran');
    expect(jsonRes.status).toBe(200);
    const json: unknown = await jsonRes.json();
    expect(json).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });
});
