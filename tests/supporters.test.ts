import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { TwitchIntegration } from '../server/twitch';
import type { TokenVault } from '../server/vault';
import { twitchTier } from '../shared/supporters';

test('supporter ranks are cosmetic and independent of elected Lord status', () => {
  const w = new World('simulation', ':memory:');
  const live = new World('live', ':memory:');
  try {
    const before = w.character('sim-0001');
    for (const tier of [0, 1, 2, 3] as const) {
      w.setSimulationSupporter(before.id, tier);
      const after = w.character(before.id);
      assert.deepEqual(after.stats, before.stats);
      assert.equal(after.gold, before.gold);
      assert.equal(after.xp, before.xp);
      assert.equal(after.isLord, before.isLord);
      assert.deepEqual(after.gear, before.gear);
      assert.equal(after.supporter!.tier, tier);
      assert.equal(after.supporter!.source, 'simulation');
    }
    assert.equal(w.character(before.id).supporter!.title, 'Duke');
    const lord = w.get('SELECT character_id FROM lords WHERE ends_at>? LIMIT 1', w.now())!;
    w.setSimulationSupporter(lord.character_id, 0);
    assert.equal(w.character(lord.character_id).isLord, true);
    assert.equal(w.character(lord.character_id).supporter!.title, 'Citizen');
    assert.throws(() => live.setSimulationSupporter('nobody', 3));
    assert.throws(() => w.setSimulationSupporter(before.id, 4 as any));
    w.command({ subject: 'sim:new', name: 'New' }, { type: 'join', argument: 'north' }, 'new');
    assert.equal(w.supporterFor(w.get("SELECT id FROM users WHERE subject='sim:new'")!.id).tier, 0);
    assert.deepEqual(['1000', '2000', '3000'].map(twitchTier), [1, 2, 3]);
    assert.throws(() => twitchTier('Prime'));
  } finally {
    w.close();
    live.close();
  }
});

function fixture() {
  const w = new World('live', ':memory:');
  const twitch = new TwitchIntegration(w, {
    write: () => {},
    read: () => null,
  } as unknown as TokenVault);
  (twitch as any).grant = {
    userId: 'channel-1',
    login: 'channel',
    scopes: ['user:read:chat', 'channel:read:subscriptions'],
    access_token: 'test-token',
    refresh_token: 'test-refresh',
  };
  twitch.status.subscriptions = true;
  for (let i = 1; i <= 4; i++)
    w.command(
      { subject: `twitch:${i}`, name: `Citizen ${i}` },
      { type: 'join', argument: 'north' },
      `join${i}`,
    );
  return {
    w,
    twitch,
    close: () => {
      twitch.close();
      w.close();
    },
  };
}

test('supporter sync batches at 100 identities and rolls back the entire reconciliation after a later failure', async () => {
  const f = fixture(),
    original = globalThis.fetch;
  for (let i = 5; i <= 103; i++)
    f.w.command(
      { subject: `twitch:${i}`, name: 'Citizen' },
      { type: 'join', argument: 'north' },
      'j' + i,
    );
  const batches: number[] = [];
  globalThis.fetch = async (input) => {
    const users = new URL(String(input)).searchParams.getAll('user_id');
    batches.push(users.length);
    if (batches.length === 2) return new Response('', { status: 500 });
    return Response.json({
      data: users.map((user_id) => ({
        user_id,
        broadcaster_id: 'channel-1',
        tier: '1000',
        is_gift: false,
      })),
      pagination: {},
    });
  };
  try {
    await assert.rejects(f.twitch.syncSupporters());
    assert.deepEqual(batches, [100, 3]);
    assert.equal(f.w.all('SELECT * FROM supporter_status').length, 0);
  } finally {
    globalThis.fetch = original;
    f.close();
  }
});

test('verified Twitch tiers reconcile gifts, non-subscribers, upgrades and expiries without gameplay rewards', async () => {
  const f = fixture(),
    original = globalThis.fetch;
  let tiers = ['1000', '2000', '3000'];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.twitch.tv');
    assert.equal(url.searchParams.get('broadcaster_id'), 'channel-1');
    assert.equal(url.searchParams.getAll('user_id').length, 4);
    return Response.json({
      data: tiers.map((tier, i) => ({
        user_id: String(i + 1),
        broadcaster_id: 'channel-1',
        tier,
        is_gift: i === 0,
      })),
      pagination: {},
    });
  };
  try {
    const ids = f.w.all('SELECT id FROM characters ORDER BY joined_at,id').map((c) => c.id);
    const stats = ids.map((id) => f.w.character(id).stats);
    const rewards = f.w.all('SELECT * FROM rewards').length;
    await f.twitch.syncSupporters();
    const bySubject = (n: number) =>
      f.w.character(f.w.get('SELECT id FROM users WHERE subject=?', `twitch:${n}`)!.id);
    assert.deepEqual(
      [1, 2, 3, 4].map((n) => bySubject(n).supporter!.tier),
      [1, 2, 3, 0],
    );
    assert.equal(bySubject(1).supporter!.gifted, true);
    const events = f.w.all("SELECT * FROM events WHERE type='supporter'").length;
    await f.twitch.syncSupporters();
    assert.equal(f.w.all("SELECT * FROM events WHERE type='supporter'").length, events);
    assert.equal(f.w.all('SELECT * FROM rewards').length, rewards);
    assert.deepEqual(
      ids.map((id) => f.w.character(id).stats),
      stats,
    );
    tiers = ['3000'];
    await f.twitch.syncSupporters();
    assert.deepEqual(
      [1, 2, 3, 4].map((n) => bySubject(n).supporter!.tier),
      [3, 0, 0, 0],
    );
    f.w.clockOffset = 1800001;
    assert.equal(bySubject(1).supporter!.source, 'unavailable');
    assert.equal(bySubject(1).supporter!.tier, null);
    f.w.clockOffset = 0;
    f.twitch.disconnect();
    assert.equal(bySubject(1).supporter!.source, 'unavailable');
  } finally {
    globalThis.fetch = original;
    f.close();
  }
});

test('failed, malformed or cross-channel subscription reads never partially grant ranks', async () => {
  const f = fixture(),
    original = globalThis.fetch;
  let body: any = {
    data: [{ user_id: '1', broadcaster_id: 'wrong-channel', tier: '3000', is_gift: false }],
    pagination: {},
  };
  globalThis.fetch = async () => Response.json(body);
  try {
    await assert.rejects(f.twitch.syncSupporters(), /identity/);
    assert.equal(f.w.all('SELECT * FROM supporter_status').length, 0);
    body = {
      data: [{ user_id: '1', broadcaster_id: 'channel-1', tier: 'unknown', is_gift: false }],
      pagination: {},
    };
    await assert.rejects(f.twitch.syncSupporters(), /tier/);
    assert.equal(f.w.all('SELECT * FROM supporter_status').length, 0);
    body = { data: [], pagination: { cursor: 'incomplete' } };
    await assert.rejects(f.twitch.syncSupporters(), /Incomplete/);
    globalThis.fetch = async () => new Response('', { status: 403 });
    await assert.rejects(f.twitch.syncSupporters(), /access/);
    assert.equal(f.twitch.status.subscriptions, false);
    await assert.rejects(f.twitch.syncSupporters(), /optional/);
  } finally {
    globalThis.fetch = original;
    f.close();
  }
});
