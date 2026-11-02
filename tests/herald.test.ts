import test from 'node:test';
import assert from 'node:assert/strict';
import { HeraldQueue, deterministicHerald } from '../shared/herald';
import { World } from '../server/world';
import { localSpeech } from '../server/herald';
import { createApp } from '../server/app';

test('Herald audio requires owner access, current world, enabled voice and a recent canonical event', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, {
    bootstrap: 'herald-test-secret',
    test: true,
  });
  try {
    const w = worlds.simulation;
    const id = w.event('battle', 'North holds', 'The defending banner holds.');
    const url = `/api/simulation/overlay/snapshot?heraldAudio=${id}&generation=${w.snapshot().generation}`;
    assert.equal((await app.inject({ url })).statusCode, 401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'herald-test-secret' },
    });
    const headers = { cookie: `cv_session=${login.cookies[0].value}` };
    assert.equal((await app.inject({ url, headers })).statusCode, 409);
    w.updateSettings({
      herald: { enabled: true, volume: 0.7, frequency: 'balanced' },
      quiet: true,
    });
    assert.equal((await app.inject({ url, headers })).statusCode, 409);
    w.updateSettings({ quiet: false });
    assert.equal(
      (await app.inject({ url: url.replace('generation=', 'generation=stale'), headers }))
        .statusCode,
      409,
    );
    w.run('UPDATE herald_events SET created_at=? WHERE event_id=?', w.now() - 31000, id);
    assert.equal((await app.inject({ url, headers })).statusCode, 404);
    assert.equal(worlds.live.get('SELECT COUNT(*) n FROM herald_events')!.n, 0);
  } finally {
    await app.close();
    worlds.simulation.close();
    worlds.live.close();
  }
});

test('battle narration reflects persisted outcome and replay never produces another line', () => {
  const w = new World('simulation', ':memory:');
  try {
    const id = w.createChapter('east', 'frostpass', 60, 42);
    const result = w.completeSimulationBattle(id);
    const rows = w.all('SELECT * FROM herald_events');
    assert.match(rows.at(-1)!.text, /fortress health/);
    assert.match(
      rows.at(-1)!.text,
      new RegExp(String(result.result!.winner === 'north' ? 'North' : 'East')),
    );
    w.completeSimulationBattle(id);
    assert.deepEqual(w.all('SELECT * FROM herald_events'), rows);
  } finally {
    w.close();
  }
});
test('Herald ignores minor events, prioritizes results, deduplicates and suppresses quiet/reconnect history', () => {
  assert.equal(deterministicHerald.compose({ type: 'join', title: 'Join', body: 'Citizen' }), null);
  const q = new HeraldQueue();
  const line = (id: number, priority = 1) => ({ id, priority, text: 'Saved fact', at: 1000 });
  q.ingest('sim:realm:one', [line(1)], true, false, 'balanced');
  assert.equal(q.take(1000, false, 1000), null);
  q.ingest('sim:realm:one', [line(3, 3), line(2)], true, false, 'balanced');
  assert.equal(q.take(1000, true, 1000), null);
  assert.equal(q.take(1000, false, 1000)?.id, 3);
  q.ingest('sim:realm:one', [line(3, 3)], true, false, 'balanced');
  assert.equal(q.take(2000, false, 2000), null);
  q.ingest('sim:realm:one', [line(4)], true, true, 'balanced');
  assert.equal(q.take(14000, false, 14000), null);
  q.ingest('live:realm:one', [line(5)], true, false, 'balanced');
  assert.equal(q.take(15000, false, 15000), null);
  q.ingest('live:realm:one', [line(6)], true, false, 'major');
  assert.equal(q.take(16000, false, 16000), null);
});
test('canonical narration survives narrative enrichment and stays isolated', () => {
  const sim = new World('simulation', ':memory:'),
    live = new World('live', ':memory:');
  try {
    const id = sim.event('milestone', 'Match victory', 'Confirmed by streamer');
    sim.run("UPDATE events SET body='Later atmosphere' WHERE id=?", id);
    assert.match(
      sim.get('SELECT text FROM herald_events WHERE event_id=?', id)!.text,
      /The streamer confirms: Match victory/,
    );
    assert.equal(live.get('SELECT COUNT(*) n FROM herald_events')!.n, 0);
    assert.equal(sim.settings().herald?.enabled, false);
  } finally {
    sim.close();
    live.close();
  }
});
test('local TTS returns WAV or explicit text-only fallback and caches the same request', async () => {
  const first = localSpeech('Royal Herald. The local voice is ready.'),
    second = localSpeech('Royal Herald. The local voice is ready.');
  if (process.platform === 'win32') assert.equal(first, second);
  const audio = await first;
  if (audio) assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
  else assert.equal(audio, null);
});
