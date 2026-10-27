import { mkdtempSync } from 'node:fs';
import { tmpdir, cpus, platform, release } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { World } from '../server/world';
import { removeOwnedTestDirectory } from '../tests/helpers';
const directory = mkdtempSync(join(tmpdir(), 'chatverse-benchmark-'));
const w = new World('simulation', join(directory, 'simulation.sqlite'));
const sample = (fn: () => unknown, n: number) => {
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  values.sort((a, b) => a - b);
  return {
    samples: n,
    p50Ms: Number(values[Math.floor(n * 0.5)].toFixed(2)),
    p95Ms: Number(values[Math.floor(n * 0.95)].toFixed(2)),
    maxMs: Number(values.at(-1)!.toFixed(2)),
  };
};
try {
  w.atomic(() => {
    for (let i = 601; i <= 10000; i++) {
      const id = `bench-${i}`;
      w.run('INSERT INTO users VALUES (?,?,?,1)', id, `sim:${id}`, `Synthetic census citizen ${i}`);
      w.run(
        'INSERT INTO characters(id,user_id,kingdom,class,xp,gold,joined_at,last_active) VALUES (?,?,?,?,?,?,?,?)',
        id,
        id,
        ['north', 'east', 'west'][i % 3],
        'vanguard',
        100,
        100,
        w.now(),
        w.now(),
      );
    }
  });
  let actor = 0;
  const result = {
    kind: 'Short local file-backed preflight; not a sustained network/OBS load test',
    hardware: {
      cpu: cpus()[0]?.model,
      platform: platform(),
      os: release(),
      node: process.version,
      sqlite: w.get('SELECT sqlite_version() version')!.version,
    },
    population: w.snapshot().citizens,
    snapshot: sample(() => w.snapshot(), 100),
    paginatedCensus: sample(() => w.listCharacters('Synthetic', '', 0), 100),
    freshJoinCommit: sample(() => {
      const id = ++actor;
      w.command(
        { subject: `sim:load-${id}`, name: `Synthetic load citizen ${id}` },
        { type: 'join', argument: 'north' },
        `load-command-${id}`,
      );
    }, 250),
    rssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    acceptedCommands: actor,
    storedReceipts: w.get("SELECT COUNT(*) n FROM receipts WHERE key LIKE 'load-command-%'")!.n,
    integrity: w.get('PRAGMA integrity_check'),
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  w.close();
  removeOwnedTestDirectory(directory);
}
