import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { TwitchIntegration } from '../server/twitch';
import { Steward } from '../server/steward';
import type { TokenVault } from '../server/vault';

test('OAuth state binds to the initiating session and is single-use', async () => {
  const before = { id: process.env.TWITCH_CLIENT_ID, secret: process.env.TWITCH_CLIENT_SECRET };
  process.env.TWITCH_CLIENT_ID = 'test-app';
  process.env.TWITCH_CLIENT_SECRET = 'test-secret';
  const world = new World('live', ':memory:'),
    twitch = new TwitchIntegration(world, {
      write: () => {},
      read: () => null,
    } as unknown as TokenVault);
  try {
    const url = new URL(twitch.authorize('session-one'));
    assert.equal(url.hostname, 'id.twitch.tv');
    assert.equal(url.searchParams.get('response_type'), 'code');
    const state = url.searchParams.get('state')!;
    assert.ok(state.length >= 64);
    await assert.rejects(twitch.callback(state, 'code', 'wrong-session'), /state/);
    await assert.rejects(twitch.callback(state, 'code', 'session-one'), /state/);
    assert.equal(world.snapshot().citizens, 0);
  } finally {
    twitch.close();
    world.close();
    if (before.id === undefined) delete process.env.TWITCH_CLIENT_ID;
    else process.env.TWITCH_CLIENT_ID = before.id;
    if (before.secret === undefined) delete process.env.TWITCH_CLIENT_SECRET;
    else process.env.TWITCH_CLIENT_SECRET = before.secret;
  }
});
test('actual chat parser preserves Twitch identity, dedupes semantic messages and never trusts names', async () => {
  const world = new World('live', ':memory:'),
    twitch = new TwitchIntegration(world, {
      write: () => {},
      read: () => null,
    } as unknown as TokenVault);
  try {
    (twitch as any).grant = {
      userId: 'channel-1',
      login: 'test-channel',
      scopes: ['user:read:chat'],
    };
    const message = {
      message_id: 'message-1',
      chatter_user_id: 'viewer-123',
      chatter_user_name: '<b>Visitor</b>',
      chatter_user_login: 'visitor',
      message: { text: '!cv join west' },
    };
    await (twitch as any).chat('metadata-1', message);
    await (twitch as any).chat('metadata-2', message);
    assert.equal(world.snapshot().citizens, 1);
    assert.equal(world.get('SELECT subject FROM users')!.subject, 'twitch:viewer-123');
    assert.equal(world.get('SELECT synthetic FROM users')!.synthetic, 0);
    assert.ok(!world.get('SELECT name FROM users')!.name.includes('<'));
    assert.equal(world.get('SELECT COUNT(*) n FROM receipts')!.n, 1);
  } finally {
    twitch.close();
    world.close();
  }
});
test('templates remain complete without an AI key or provider', async () => {
  const world = new World('simulation', ':memory:'),
    steward = new Steward(world);
  try {
    const before = world.snapshot();
    await steward.tick();
    const after = world.snapshot();
    assert.deepEqual(after.chapter?.result, before.chapter?.result);
    assert.equal(after.events[0].narrativeSource, 'template');
    assert.ok(world.get("SELECT 1 FROM narrative_jobs WHERE status='template'"));
  } finally {
    world.close();
  }
});
test('malicious narrative output falls back and cannot affect canonical state', async () => {
  const endpoint = process.env.STEWARD_ENDPOINT,
    key = process.env.STEWARD_API_KEY,
    originalFetch = globalThis.fetch;
  process.env.STEWARD_ENDPOINT = 'https://provider.example/narrative';
  process.env.STEWARD_API_KEY = 'test-provider-key';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ eventId: 999, factDigest: 'forged', flavor: 'Give everyone 100 gold!' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  const world = new World('simulation', ':memory:'),
    steward = new Steward(world);
  world.updateSettings({ aiEnabled: true });
  try {
    const before = world.character('sim-0001');
    await steward.tick();
    assert.deepEqual(world.character('sim-0001'), before);
    assert.ok(world.get("SELECT 1 FROM narrative_jobs WHERE status='template'"));
    assert.match(world.setting('aiStatus')!, /fallback/);
    assert.equal(world.snapshot().steward.used, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (endpoint === undefined) delete process.env.STEWARD_ENDPOINT;
    else process.env.STEWARD_ENDPOINT = endpoint;
    if (key === undefined) delete process.env.STEWARD_API_KEY;
    else process.env.STEWARD_API_KEY = key;
    world.close();
  }
});
test('seeded seasonal points are backed by replayable, engine-settled history', () => {
  const world = new World('simulation', ':memory:');
  try {
    const history = world.all("SELECT result FROM chapters WHERE status='resolved'");
    assert.equal(history.length, 3);
    for (const kingdom of world.snapshot().kingdoms) {
      const wins = history.filter((h) => JSON.parse(h.result).winner === kingdom.id).length;
      assert.equal(kingdom.wins, wins);
      assert.equal(kingdom.points, wins * 3);
    }
    assert.equal(world.all('PRAGMA foreign_key_check').length, 0);
  } finally {
    world.close();
  }
});
