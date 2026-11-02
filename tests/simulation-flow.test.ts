import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { createApp } from '../server/app';
import { resolveBattle } from '../server/engine';

for (const duration of [30, 60, 180])
  test(`full simulation rallies both armies and closes an actual ${duration}s vote exactly once`, () => {
    const w = new World('simulation', ':memory:');
    try {
      const id = w.createChapter('east', 'frostpass', duration, 42);
      const ch = w.completeSimulationBattle(id);
      assert.equal(ch.status, 'resolved');
      assert(ch.pledged.east > 0 && ch.pledged.north > 0);
      assert.deepEqual(resolveBattle(ch.input!), ch.result);
      const rewards = w.all('SELECT * FROM rewards WHERE source_id=? ORDER BY character_id', id);
      assert(rewards.length > 0);
      assert.equal(w.completeSimulationBattle(id).status, 'resolved');
      assert.deepEqual(
        w.all('SELECT * FROM rewards WHERE source_id=? ORDER BY character_id', id),
        rewards,
      );
    } finally {
      w.close();
    }
  });

test('closed, paused, stale and empty-army simulation controls fail without changing another battle', () => {
  const w = new World('simulation', ':memory:');
  const live = new World('live', ':memory:');
  try {
    const id = w.createChapter('east', 'frostpass', 180);
    w.controlChapter(id, 'pause');
    assert.throws(() => w.completeSimulationBattle(id), /Resume/);
    w.controlChapter(id, 'cancel');
    assert.throws(() => w.completeSimulationBattle(id), /closed/);
    const next = w.createChapter('east', 'frostpass', 180);
    assert.throws(() => w.simulatePledges(id), /not the active/);
    assert.equal(w.chapter(next).pledged.east, 0);
    w.run("UPDATE characters SET kingdom='west' WHERE kingdom='east'");
    const before = w.now();
    assert.throws(() => w.completeSimulationBattle(next), /Both kingdoms/);
    assert(w.now() - before < 1000);
    assert.equal(w.chapter(next).pledged.north, 0);
    assert.equal(w.chapter(next).status, 'open');
    assert.throws(() => live.completeSimulationBattle(next), /cannot run in Live/);
  } finally {
    w.close();
    live.close();
  }
});

test('simulation completion HTTP action is owner/CSRF protected and feeds the read-only realm overlay', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, {
    bootstrap: 'simulation-flow-secret',
    test: true,
  });
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'simulation-flow-secret' },
    });
    const headers = {
      cookie: `cv_session=${login.cookies[0].value}`,
      'x-csrf-token': login.json().csrf,
    };
    const id = worlds.simulation.createChapter('east', 'frostpass', 180, 42);
    const url = `/api/simulation/chapters/${id}/complete`;
    const preview = await app.inject({
      url: '/api/simulation/overlay/snapshot',
      headers: {
        ...headers,
        cookie: headers.cookie + '; cv_overlay_simulation=expired-overlay-session',
      },
    });
    assert.equal(preview.statusCode, 200, preview.body);
    assert.equal(
      (
        await app.inject({
          url: '/api/simulation/overlay/snapshot',
          headers: { cookie: 'cv_overlay_simulation=expired-overlay-session' },
        })
      ).statusCode,
      401,
    );
    assert.equal((await app.inject({ method: 'POST', url })).statusCode, 401);
    assert.equal(
      (await app.inject({ method: 'POST', url, headers: { cookie: headers.cookie } })).statusCode,
      403,
    );
    const result = await app.inject({ method: 'POST', url, headers });
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().status, 'resolved');
    const overlay = await app.inject({ url: '/api/simulation/overlay/snapshot', headers });
    assert.equal(overlay.statusCode, 200, overlay.body);
    assert.equal(overlay.json().chapter.id, id);
    assert.match(result.json().result.outputHash, /^[a-f0-9]{64}$/);
    assert.equal(overlay.json().chapter.result.outputHash, result.json().result.outputHash);
    assert.deepEqual(overlay.json().chapter.result.rounds, result.json().result.rounds);
    assert.equal(overlay.json().chapter.result.winner, result.json().result.winner);
    assert.equal(
      (await app.inject({ method: 'POST', url: `/api/live/chapters/${id}/complete`, headers }))
        .statusCode,
      404,
    );
  } finally {
    await app.close();
    worlds.simulation.close();
    worlds.live.close();
  }
});
