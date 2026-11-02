import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { TwitchIntegration } from '../server/twitch';
import type { TokenVault } from '../server/vault';
import { overlayChapterVisible } from '../shared/overlay';

// Invoke the notification handler after the authenticated channel check, without a Twitch socket.
function fixture() {
  let time = Date.UTC(2026, 9, 31, 19);
  const world = new World('live', ':memory:', () => time);
  const adapter = new TwitchIntegration(world, {
    read: () => null,
    write: () => {},
  } as unknown as TokenVault);
  const wire = adapter as any;
  wire.grant = {
    userId: 'channel',
    login: 'channel',
    scopes: ['user:read:chat', 'user:write:chat'],
  };
  Object.assign(adapter.status, { connected: true, replies: true, channel: 'channel' });
  const chat = (user: string, text: string, id: string) =>
    wire.chat('delivery-' + id, {
      message_id: id,
      chatter_user_id: user,
      chatter_user_login: user,
      chatter_user_name: user,
      message: { text },
    });
  return {
    world,
    adapter,
    wire,
    chat,
    elapse: (ms: number) => {
      time += ms;
    },
    close: () => {
      adapter.close();
      world.close();
    },
  };
}

test('a single actionable Live invitation respects opt-in; resuming a paused chapter only refreshes its HUD', () => {
  const f = fixture();
  try {
    for (const settings of [{ chatOutput: false }, { chatOutput: true, quiet: true }]) {
      f.world.updateSettings(settings);
      const muted = f.world.createChapter('east', 'crossroads', 60, 23);
      assert.equal(f.world.get('SELECT COUNT(*) n FROM outbox')!.n, 0);
      f.world.controlChapter(muted, 'cancel');
    }
    f.world.updateSettings({ chatOutput: true, quiet: false });
    const id = f.world.createChapter('east', 'crossroads', 60, 23);
    const invite = f.world.get('SELECT * FROM outbox')!;
    assert.match(invite.body, /Crossroads.*!join east or !join north.*!pledge.*!vote attack/);
    f.world.controlChapter(id, 'pause');
    f.elapse(13000);
    assert.equal(overlayChapterVisible(f.world.chapter(id), f.world.now(), false), false);
    f.world.controlChapter(id, 'resume');
    assert.equal(overlayChapterVisible(f.world.chapter(id), f.world.now(), false), true);
    f.elapse(12000);
    assert.equal(overlayChapterVisible(f.world.chapter(id), f.world.now(), false), false);
    assert.equal(f.world.get('SELECT COUNT(*) n FROM outbox')!.n, 1);
    assert.equal(f.world.get('SELECT status FROM outbox')!.status, 'expired');
  } finally {
    f.close();
  }
});

test('distinct join, class, pledge and vote run consecutively; duplicate or rejected messages cannot mint votes', async () => {
  const f = fixture();
  try {
    f.world.updateSettings({ chatOutput: true });
    const id = f.world.createChapter('east', 'crossroads', 60, 23);
    await f.chat('visitor', '!join east', 'join');
    await f.chat('visitor', '!class rogue', 'class');
    await f.chat('visitor', '!pledge', 'pledge');
    await f.chat('visitor', '!vote attack', 'vote');
    await f.chat('visitor', '!vote attack', 'vote');
    const visitor = f.world.get("SELECT id FROM users WHERE subject='twitch:visitor'")!.id;
    assert.equal(f.world.character(visitor).class, 'rogue');
    assert.equal(f.world.chapter(id, visitor).myVote, 'attack');
    assert.equal(f.world.get('SELECT COUNT(*) n FROM votes')!.n, 1);
    assert.equal(f.world.get('SELECT COUNT(*) n FROM rewards')!.n, 1);
    assert.equal(f.wire.queue.filter((r: any) => r.body.includes('ballot is recorded')).length, 1);
    await f.chat('visitor', '!vote raid', 'fifth');
    assert.equal(f.world.chapter(id, visitor).myVote, 'attack');
    assert.match(f.wire.queue.at(-1).body, /Try again in/);
    await f.chat('scout', '!join north', 'join-scout');
    await f.chat('scout', '!vote raid', 'early-vote');
    await f.chat('scout', '!pledge', 'pledge-scout');
    await f.chat('scout', '!vote raid', 'early-vote');
    assert.equal(f.world.get('SELECT COUNT(*) n FROM votes')!.n, 1);
    await f.chat('scout', '!vote defend', 'new-vote');
    assert.equal(f.world.get('SELECT COUNT(*) n FROM votes')!.n, 2);
    await f.chat('visitor', '!profile', 'profile');
    await f.chat('visitor', '!inventory', 'inventory');
    assert.match(f.wire.queue.at(-1).body, /iron-blade/);
  } finally {
    f.close();
  }
});

test('returning chat viewers keep their character and receive an eligible next command', async () => {
  const f = fixture();
  try {
    f.world.updateSettings({ chatOutput: true });
    await f.chat('viewer', '!join north', 'welcome');
    assert.match(f.wire.queue.at(-1).body, /Vanguard.*Ironbound Blade.*!profile/);
    await f.chat('viewer', '!join north', 'return');
    assert.match(f.wire.queue.at(-1).body, /Welcome back.*!profile/);
    f.world.createChapter('east', 'crossroads', 60, 23);
    await f.chat('viewer', '!join north', 'return-open');
    assert.match(f.wire.queue.at(-1).body, /Welcome back.*!pledge/);
    assert.equal(f.world.get('SELECT COUNT(*) n FROM characters')!.n, 1);
    assert.equal(f.world.get('SELECT COUNT(*) n FROM rewards')!.n, 1);
  } finally {
    f.close();
  }
});

test('setup proof requires a saved accepted join from the current authorized channel', async () => {
  const f = fixture();
  try {
    await f.chat('viewer', 'hello', 'ordinary');
    assert.equal(f.world.integration().lastAcceptedJoin, null);
    await f.chat('viewer', '!join invalid', 'invalid');
    assert.equal(f.world.integration().lastAcceptedJoin, null);
    await f.chat('viewer', '!join north', 'accepted');
    assert.equal(f.world.integration().lastAcceptedJoin?.kingdom, 'north');
    assert.equal(f.world.integration().lastAcceptedJoin?.name, 'viewer');
    f.adapter.status.connected = false;
    assert.equal(f.world.integration().lastAcceptedJoin, null);
    f.adapter.status.connected = true;
    assert(f.world.integration().lastAcceptedJoin);
    f.wire.grant.userId = 'different-channel';
    assert.equal(f.world.integration().lastAcceptedJoin, null);
    f.wire.grant.userId = 'channel';
    f.world.run("UPDATE environment SET generation='replacement' WHERE id=1");
    assert.equal(f.world.integration().lastAcceptedJoin, null);
  } finally {
    f.close();
  }
});

test('expired replies are purged while offline; current write replies and invitations get priority without exceeding budget', async () => {
  const f = fixture();
  try {
    f.world.updateSettings({ chatOutput: true });
    f.adapter.status.connected = false;
    for (let i = 0; i < 50; i++) f.adapter.enqueue('old');
    f.wire.queue.forEach((q: any) => (q.expires = Date.now() - 1));
    await f.wire.flush();
    assert.equal(f.wire.queue.length, 0);
    for (let i = 0; i < 45; i++) f.adapter.enqueue('profile');
    assert(f.adapter.enqueue('vote saved', undefined, 1));
    f.world.createChapter('east', 'crossroads', 60, 2);
    const sent: string[] = [];
    f.wire.helix = async (_path: string, options: any) => {
      sent.push(JSON.parse(options.body).message);
      return { data: [{ is_sent: true, message_id: 'sent-' + sent.length }] };
    };
    f.adapter.status.connected = true;
    await f.wire.flush();
    assert.match(sent[0], /!pledge/);
    await f.wire.flush();
    assert.equal(sent[1], 'vote saved');
    for (let i = 0; i < 20; i++) await f.wire.flush();
    assert.equal(sent.length, 10);
    assert(f.wire.queue.length <= 50);
  } finally {
    f.close();
  }
});
