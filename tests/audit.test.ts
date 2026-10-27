import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { Steward } from '../server/steward';
import { TwitchIntegration } from '../server/twitch';
import type { TokenVault } from '../server/vault';
import { createApp } from '../server/app';
import { resolveBattle, statsFor } from '../server/engine';
import type { BattleInput } from '../shared/types';
import { backup } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeOwnedTestDirectory } from './helpers';

test('audit: delayed AI response cannot modify a reset world or its provider budget', async () => {
  const endpoint = process.env.STEWARD_ENDPOINT,
    key = process.env.STEWARD_API_KEY,
    original = globalThis.fetch;
  process.env.STEWARD_ENDPOINT = 'https://provider.example/narrative';
  process.env.STEWARD_API_KEY = 'test-key';
  const world = new World('simulation', ':memory:'),
    steward = new Steward(world);
  let finish!: (response: Response) => void;
  let request: any;
  globalThis.fetch = async (_input, options) => {
    request = JSON.parse(options!.body as string);
    return new Promise((resolve) => (finish = resolve));
  };
  try {
    world.updateSettings({ aiEnabled: true });
    const running = steward.tick();
    assert.ok(finish);
    world.reset();
    const before = world.all('SELECT * FROM events');
    finish(
      Response.json({
        eventId: request.eventId,
        factDigest: request.factDigest,
        flavor: 'The quiet stars await.',
      }),
    );
    await running;
    assert.deepEqual(world.all('SELECT * FROM events'), before);
    assert.equal(world.setting('aiStatus'), undefined);
    assert.equal(world.setting('aiFailures'), undefined);
  } finally {
    globalThis.fetch = original;
    world.close();
    if (endpoint === undefined) delete process.env.STEWARD_ENDPOINT;
    else process.env.STEWARD_ENDPOINT = endpoint;
    if (key === undefined) delete process.env.STEWARD_API_KEY;
    else process.env.STEWARD_API_KEY = key;
  }
});

test('audit: Unicode unlock input is rejected normally and ten-minute lockout starts a fresh window', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, { bootstrap: 'abcdefghijkl', test: true });
  await app.ready();
  try {
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { code: 'é'.repeat(12) } }))
        .statusCode,
      401,
    );
    for (let i = 0; i < 9; i++)
      await app.inject({ method: 'POST', url: '/api/session', payload: { code: 'wrong' } });
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { code: 'abcdefghijkl' } }))
        .statusCode,
      429,
    );
    now += 600001;
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { code: 'wrong' } }))
        .statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ method: 'POST', url: '/api/session', payload: { code: 'abcdefghijkl' } }))
        .statusCode,
      200,
    );
  } finally {
    await app.close();
    Object.values(worlds).forEach((w) => w.close());
  }
});

test('audit: chat outbox never sends stale announcements or loses rows when the queue is full', async () => {
  const world = new World('live', ':memory:');
  const twitch = new TwitchIntegration(world, {
    read: () => null,
    write: () => {},
  } as unknown as TokenVault);
  const original = globalThis.fetch;
  const sent: string[] = [];
  globalThis.fetch = async (_input, options) => {
    sent.push(JSON.parse(options!.body as string).message);
    return Response.json({ data: [{ is_sent: true, message_id: 'sent' }] });
  };
  try {
    (twitch as any).grant = { userId: 'channel', scopes: ['user:write:chat'] };
    twitch.status.connected = true;
    twitch.status.replies = true;
    world.updateSettings({ chatOutput: true });
    const event = world.event('announcement', 'Old announcement', 'Old announcement');
    world.run(
      'INSERT INTO outbox(event_id,body,created_at) VALUES (?,?,?)',
      event,
      'Old announcement',
      world.now() - 60000,
    );
    await (twitch as any).flush();
    assert.deepEqual(sent, []);
    const fresh = world.event('announcement', 'Fresh', 'Fresh');
    world.run(
      'INSERT INTO outbox(event_id,body,created_at) VALUES (?,?,?)',
      fresh,
      'Fresh',
      world.now(),
    );
    for (let i = 0; i < 50; i++) twitch.enqueue('queued');
    await (twitch as any).flush();
    assert.notEqual(
      world.get('SELECT status FROM outbox WHERE event_id=?', fresh)!.status,
      'queued',
    );
  } finally {
    globalThis.fetch = original;
    twitch.close();
    world.close();
  }
});

test('audit: switching kingdoms relinquishes the old Lord office', () => {
  const world = new World('simulation', ':memory:');
  try {
    const row = world.get(
      'SELECT l.character_id,c.kingdom,u.subject,u.name FROM lords l JOIN characters c ON c.id=l.character_id JOIN users u ON u.id=c.user_id WHERE l.ends_at>? LIMIT 1',
      world.now(),
    )!;
    world.command(
      { subject: row.subject, name: row.name },
      { type: 'join', argument: row.kingdom === 'east' ? 'west' : 'east' },
      'lord-switch',
    );
    assert.equal(world.snapshot().kingdoms.find((k) => k.id === row.kingdom)!.lord, null);
    assert.equal(world.character(row.character_id).isLord, false);
  } finally {
    world.close();
  }
});

test('audit: season archives preserve tied standings instead of arbitrary unique places', () => {
  const world = new World('simulation', ':memory:');
  try {
    world.run('UPDATE kingdoms SET points=0,wins=0');
    world.run('UPDATE characters SET contribution=0');
    // Equal ownership totals after bonus: 2/2/2 noncapital regions.
    const borders = world.all(
      "SELECT id FROM territories WHERE id NOT IN('northhold','eastkeep','westspire') ORDER BY id",
    );
    borders.forEach((t, i) =>
      world.run(
        'UPDATE territories SET owner=? WHERE id=?',
        ['north', 'east', 'west'][i % 3],
        t.id,
      ),
    );
    world.advance(8 * 86400);
    assert.equal(
      world.all("SELECT DISTINCT rank FROM season_awards WHERE kind='citizen'").length,
      1,
    );
  } finally {
    world.close();
  }
});

test('audit: late upgrade settles a closed council before changing its frozen roster stats', () => {
  const world = new World('simulation', ':memory:');
  try {
    world.run("UPDATE territories SET owner='north',last_session=NULL WHERE id='crossroads'");
    const chapter = world.createChapter('east', 'crossroads', 60, 77);
    world.simulatePledges();
    const citizen = world.get(
      'SELECT p.character_id,u.subject,u.name FROM participants p JOIN characters c ON c.id=p.character_id JOIN users u ON u.id=c.user_id WHERE p.chapter_id=? LIMIT 1',
      chapter,
    )!;
    const before = world.character(citizen.character_id);
    world.run('UPDATE characters SET gold=10000 WHERE id=?', before.id);
    world.clockOffset += 61000;
    world.command(
      { subject: citizen.subject, name: citizen.name },
      { type: 'upgrade', argument: before.gear!.find((g) => g.slot === 'weapon')!.id },
      'late-upgrade',
    );
    const battle = world.chapter(chapter);
    assert.equal(battle.status, 'resolved');
    const frozen = battle.input!.sides.flatMap((s) => s.roster).find((c) => c.id === before.id)!;
    assert.deepEqual(frozen.stats, before.stats);
    assert.ok(world.character(before.id).stats.attack > before.stats.attack);
  } finally {
    world.close();
  }
});

test('audit: an offline council due before season end resolves before the season is archived', () => {
  const world = new World('simulation', ':memory:');
  try {
    world.run("UPDATE territories SET owner='north',last_session=NULL WHERE id='crossroads'");
    const chapter = world.createChapter('east', 'crossroads', 60, 77);
    world.simulatePledges();
    world.advance(8 * 86400);
    assert.equal(world.chapter(chapter).status, 'resolved');
    assert.ok(world.get("SELECT 1 FROM season_awards WHERE kind='kingdom'"));
  } finally {
    world.close();
  }
});

test('audit: existing SSE views close after dashboard logout and release their listener', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, { bootstrap: 'stream-test', test: true });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'stream-test' },
    });
    const headers = {
      cookie: `cv_session=${login.cookies[0].value}`,
      'x-csrf-token': login.json().csrf,
    };
    const response = await fetch(address + '/api/simulation/events', {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    reader = response.body!.getReader();
    await reader.read();
    assert.equal(worlds.simulation.listenerCount('change'), 1);
    assert.equal(
      (await app.inject({ method: 'DELETE', url: '/api/session', headers })).statusCode,
      200,
    );
    worlds.simulation.emit('change');
    assert.equal((await reader.read()).done, true);
  } finally {
    await reader?.cancel();
    app.server.closeAllConnections();
    await app.close();
    Object.values(worlds).forEach((w) => w.close());
  }
});

test('audit: malformed JSON and oversized request bodies preserve client-error status codes', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, { test: true });
  await app.ready();
  try {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/session',
          payload: '{',
          headers: { 'content-type': 'application/json' },
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: '/api/session',
          payload: 'x'.repeat(20000),
          headers: { 'content-type': 'application/json' },
        })
      ).statusCode,
      413,
    );
  } finally {
    await app.close();
    Object.values(worlds).forEach((w) => w.close());
  }
});

test('audit: token refresh cannot recreate a grant or vault credentials after disconnect', async () => {
  const world = new World('live', ':memory:'),
    writes: unknown[] = [],
    original = globalThis.fetch;
  const twitch = new TwitchIntegration(world, {
    read: () => null,
    write: (value: unknown) => writes.push(value),
  } as unknown as TokenVault);
  let finish!: (r: Response) => void;
  globalThis.fetch = async () => new Promise((resolve) => (finish = resolve));
  try {
    (twitch as any).grant = {
      userId: 'channel',
      login: 'channel',
      access_token: 'old',
      refresh_token: 'old',
      scopes: [],
    };
    const refreshing = (twitch as any).refresh();
    twitch.disconnect();
    finish(Response.json({ access_token: 'new', refresh_token: 'new' }));
    await assert.rejects(refreshing, /Authorization changed/);
    assert.equal((twitch as any).grant, null);
    assert.deepEqual(writes, [null]);
    assert.equal(twitch.status.state, 'Disconnected');
  } finally {
    globalThis.fetch = original;
    twitch.close();
    world.close();
  }
});

test('audit: disconnect cancels an OAuth callback already exchanging its code', async () => {
  const world = new World('live', ':memory:'),
    writes: unknown[] = [],
    original = globalThis.fetch;
  const twitch = new TwitchIntegration(world, {
    read: () => null,
    write: (value: unknown) => writes.push(value),
  } as unknown as TokenVault);
  twitch.status.configured = true;
  let finish!: (r: Response) => void,
    requests = 0;
  globalThis.fetch = async () =>
    ++requests === 1
      ? new Promise((resolve) => (finish = resolve))
      : Response.json({
          client_id: process.env.TWITCH_CLIENT_ID,
          user_id: 'channel',
          login: 'channel',
          scopes: ['user:read:chat', 'user:write:chat', 'channel:read:subscriptions'],
        });
  try {
    const state = new URL(twitch.authorize('session')).searchParams.get('state')!;
    const callback = twitch.callback(state, 'code', 'session');
    twitch.disconnect();
    finish(Response.json({ access_token: 'new', refresh_token: 'new' }));
    await assert.rejects(callback, /cancelled/);
    assert.equal((twitch as any).grant, null);
    assert.deepEqual(writes, [null]);
  } finally {
    globalThis.fetch = original;
    twitch.close();
    world.close();
  }
});

test('audit: malformed combat scores, sides and seeds fail validation rather than producing invalid hashes', () => {
  const stats = statsFor('vanguard', 100, []);
  const input: BattleInput = {
    seed: 1,
    ruleset: 'chatverse-v1',
    attacker: 'north',
    defender: 'east',
    territory: 'sunreach',
    sides: [
      {
        kingdom: 'north',
        tactic: 'attack',
        roster: [{ id: 'a', name: 'A', power: stats.power, stats }],
        pledged: 1,
        effective: 200,
      },
      {
        kingdom: 'east',
        tactic: 'defend',
        roster: [{ id: 'b', name: 'B', power: stats.power, stats }],
        pledged: 1,
        effective: 200,
      },
    ],
  };
  for (const value of [NaN, Infinity, -1, 0, 0.5]) {
    const bad = structuredClone(input);
    bad.sides[0].effective = value;
    assert.throws(() => resolveBattle(bad));
  }
  const seed = structuredClone(input);
  seed.seed = -1;
  assert.throws(() => resolveBattle(seed));
  const sides = structuredClone(input);
  sides.sides[1].kingdom = 'north';
  assert.throws(() => resolveBattle(sides));
});

test('audit: past-season API returns leaders for each recent season rather than exhausting the limit on one season', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, { bootstrap: 'archive-test', test: true });
  await app.ready();
  try {
    worlds.simulation.advance(8 * 86400);
    worlds.simulation.advance(8 * 86400);
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'archive-test' },
    });
    const result = (
      await app.inject({
        url: '/api/simulation/seasons',
        headers: { cookie: `cv_session=${login.cookies[0].value}` },
      })
    ).json();
    for (const season of result.seasons.filter((s: any) => s.status === 'closed'))
      assert.equal(result.awards.filter((a: any) => a.season_id === season.id).length, 6);
  } finally {
    await app.close();
    Object.values(worlds).forEach((w) => w.close());
  }
});

test('audit: SQLite backup restores gameplay and marks interrupted AI/chat work safe to recover', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-audit-backup-'));
  const world = new World('simulation', ':memory:');
  let restored: World | undefined;
  try {
    world.setSimulationSupporter('sim-0001', 1);
    const job = world.get('SELECT event_id FROM narrative_jobs LIMIT 1')!;
    world.run("UPDATE narrative_jobs SET status='requested' WHERE event_id=?", job.event_id);
    world.run(
      "INSERT INTO outbox(event_id,body,status,created_at) VALUES (?,?,'queued',?)",
      job.event_id,
      'Interrupted announcement',
      world.now(),
    );
    const path = join(directory, 'backup.sqlite');
    await backup(world.db, path);
    restored = new World('simulation', path);
    assert.equal(restored.snapshot().generation, world.snapshot().generation);
    assert.equal(restored.snapshot().citizens, 600);
    assert.equal(restored.character('sim-0001').supporter!.tier, 1);
    assert.deepEqual(restored.character('sim-0001').gear, world.character('sim-0001').gear);
    assert.equal(
      restored.get('SELECT status FROM narrative_jobs WHERE event_id=?', job.event_id)!.status,
      'template',
    );
    assert.equal(
      restored.get('SELECT status FROM outbox WHERE event_id=?', job.event_id)!.status,
      'unknown',
    );
    assert.equal(restored.get('PRAGMA integrity_check')!.integrity_check, 'ok');
    assert.deepEqual(restored.all('PRAGMA foreign_key_check'), []);
  } finally {
    restored?.close();
    world.close();
    removeOwnedTestDirectory(directory);
  }
});

test('audit: revoking an overlay capability closes an already-open read stream', async () => {
  const worlds = {
    simulation: new World('simulation', ':memory:'),
    live: new World('live', ':memory:'),
  };
  const { app } = await createApp(worlds, undefined, { bootstrap: 'overlay-test', test: true });
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const login = await app.inject({
      method: 'POST',
      url: '/api/session',
      payload: { code: 'overlay-test' },
    });
    const headers = {
      cookie: `cv_session=${login.cookies[0].value}`,
      'x-csrf-token': login.json().csrf,
    };
    const key = (
      await app.inject({ method: 'POST', url: '/api/simulation/overlay/keys', headers })
    ).json().key;
    const exchange = await app.inject({
      method: 'POST',
      url: '/api/overlay/exchange',
      payload: { mode: 'simulation', key },
    });
    const response = await fetch(address + '/api/simulation/overlay/events', {
      headers: { cookie: `cv_overlay_simulation=${exchange.cookies[0].value}` },
      signal: AbortSignal.timeout(3000),
    });
    reader = response.body!.getReader();
    await reader.read();
    assert.equal(
      (await app.inject({ method: 'DELETE', url: '/api/simulation/overlay/keys', headers }))
        .statusCode,
      200,
    );
    assert.equal((await reader.read()).done, true);
  } finally {
    await reader?.cancel();
    app.server.closeAllConnections();
    await app.close();
    Object.values(worlds).forEach((w) => w.close());
  }
});

test('audit: a failing realtime observer cannot turn a committed command into a failed transaction', () => {
  const world = new World('live', ':memory:');
  let notified = 0;
  try {
    world.on('change', () => {
      throw new Error('Disconnected observer');
    });
    world.on('change', () => notified++);
    const result = world.command(
      { subject: 'twitch:observer-test', name: 'Citizen' },
      { type: 'join', argument: 'north' },
      'observer-command',
    );
    assert.ok(result.characterId);
    assert.equal(world.snapshot().citizens, 1);
    assert.equal(notified, 1);
    assert.equal(world.get('SELECT COUNT(*) n FROM receipts')!.n, 1);
  } finally {
    world.close();
  }
});
