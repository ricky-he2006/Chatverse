import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { World } from '../server/world';
import { createApp } from '../server/app';
import { STREAM_MOMENTS } from '../shared/stream-moments';

test('one streamer action commits one fact even on concurrent transport retries; mismatched or stale actions fail', async () => {
  const worlds = {
    live: new World('live', ':memory:'),
    simulation: new World('simulation', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, {
    bootstrap: 'test-unlock-secret',
    test: true,
  });
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'test-unlock-secret' },
    });
    const headers = {
      cookie: `cv_session=${login.cookies[0].value}`,
      'x-csrf-token': login.json().csrf,
    };
    const actionId = randomUUID(),
      generation = worlds.live.snapshot().generation;
    const post = (body: Record<string, string>, transport = randomUUID()) =>
      app.inject({
        method: 'POST',
        url: '/api/live/milestone',
        headers: { ...headers, 'idempotency-key': transport },
        payload: body,
      });
    const data = { milestone: 'A hard-earned victory', actionId, generation };
    const [first, retry] = await Promise.all([post(data), post(data)]);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.json(), retry.json());
    assert.equal((await post({ ...data, milestone: 'A brave attempt' })).statusCode, 409);
    assert.equal((await post({ ...data, generation: randomUUID() })).statusCode, 409);
    assert.equal((await post({ ...data, milestone: 'invent a score' })).statusCode, 400);
    assert.equal(worlds.live.get("SELECT COUNT(*) n FROM events WHERE type='milestone'")!.n, 1);
    const original = { milestone: 'A new personal best' };
    const transport = randomUUID();
    const legacy = await post(original, transport);
    assert.equal(legacy.statusCode, 200);
    assert.deepEqual((await post(original, transport)).json(), legacy.json());
    assert.equal(worlds.live.get("SELECT COUNT(*) n FROM events WHERE type='milestone'")!.n, 2);
    for (const milestone of STREAM_MOMENTS) {
      const action = { milestone, actionId: randomUUID(), generation };
      const response = await post(action);
      assert.equal(response.statusCode, 200, response.body);
      assert.deepEqual((await post(action)).json(), response.json());
      const event = worlds.live.get(
        'SELECT title,source FROM events WHERE id=?',
        response.json().eventId,
      )!;
      assert.equal(event.title, milestone);
      assert.equal(event.source, 'streamer');
      const overlay = await app.inject({ url: '/api/live/overlay/snapshot', headers });
      assert.equal(overlay.json().events[0].title, milestone);
    }
    assert.equal(worlds.live.get("SELECT COUNT(*) n FROM events WHERE type='milestone'")!.n, 6);
    assert.equal(worlds.live.get('SELECT COUNT(*) n FROM rewards')!.n, 0);
    assert.equal(worlds.live.get('SELECT COUNT(*) n FROM ledger')!.n, 0);
  } finally {
    await app.close();
    worlds.live.close();
    worlds.simulation.close();
  }
});

test('automatic councils require a connected Live channel and recent citizens on both sides', () => {
  let now = Date.UTC(2026, 9, 31, 14);
  const w = new World('live', ':memory:', () => now);
  try {
    w.updateSettings({ autoChapters: true });
    const tickDue = () => {
      w.set('lastAutoChapter', now - 1800001);
      w.tick();
      return w.get("SELECT attacker,defender FROM chapters WHERE status='open'");
    };
    const disconnected = w.integration();
    w.integration = () => ({ ...disconnected, connected: true, channel: 'fixture' });
    assert.equal(tickDue(), undefined);
    w.command(
      { subject: 'twitch:n', name: 'North viewer' },
      { type: 'join', argument: 'north' },
      'test:n',
    );
    assert.equal(tickDue(), undefined);
    w.command(
      { subject: 'twitch:e', name: 'East viewer' },
      { type: 'join', argument: 'east' },
      'test:e',
    );
    w.integration = () => disconnected;
    assert.equal(tickDue(), undefined);
    w.integration = () => ({ ...disconnected, connected: true, channel: 'fixture' });
    now += 16 * 60000;
    assert.equal(tickDue(), undefined);
    w.command(
      { subject: 'twitch:n', name: 'North viewer' },
      { type: 'join', argument: 'north' },
      'test:n:again',
    );
    w.command(
      { subject: 'twitch:e', name: 'East viewer' },
      { type: 'join', argument: 'east' },
      'test:e:again',
    );
    const eligible = tickDue();
    assert(eligible);
    assert.deepEqual([eligible.attacker, eligible.defender].sort(), ['east', 'north']);
  } finally {
    w.close();
  }
});
