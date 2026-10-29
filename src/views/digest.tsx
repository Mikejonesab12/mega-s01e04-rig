import type { NightDigest } from '../digest/types.js';

export function DigestPage({ digest }: { digest: NightDigest }) {
  const rows = [...digest.rows].sort((a, b) => a.job.localeCompare(b.job));

  return (
    <>
      <h1>digest · {digest.night}</h1>
      <p class="mute">malformed lines: {digest.badLines}</p>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const failed = row.lastStatus === 'fail';
              const manyRetries = row.retries >= 3;
              return (
                <tr class={failed ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td class={manyRetries ? 'warn' : undefined}>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstTime}</td>
                  <td>{row.lastTime}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
