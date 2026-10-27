import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { World } from '../server/world';
import { resolveBattle } from '../server/engine';
import { removeOwnedTestDirectory } from './helpers';
const clock = () => Date.UTC(2026, 9, 27, 18);
function demo() {
  return new World('simulation', ':memory:', clock);
}
// Independent border-test setup: history is exercised separately below.
function borderFixture(w: World) {
  w.atomic(() =>
    w.run("UPDATE territories SET owner='north',last_session=NULL WHERE id='crossroads'"),
  );
}
const actor = { subject: 'sim:sim-0001', name: 'Mira Stormweaver' };
test('seed population, stats and isolated empty Live world', () => {
  const sim = demo(),
    live = new World('live', ':memory:', clock);
  try {
    assert.equal(sim.snapshot().citizens, 600);
    assert.equal(live.snapshot().citizens, 0);
    assert.deepEqual(
      sim.snapshot().kingdoms.map((k) => k.citizens),
      [220, 200, 180],
    );
    assert.equal(sim.character('sim-0001').level, 12);
    assert.ok(sim.snapshot().heroes.every((c) => c.synthetic));
    assert.throws(() => live.reset());
    assert.throws(() => live.advance(10));
    assert.throws(() => live.simulatePledges());
    assert.throws(() => live.command(actor, { type: 'join', argument: 'north' }, 'fake-live'));
  } finally {
    sim.close();
    live.close();
  }
});
test('join uses stable subject, idempotent receipt, live provenance and escaped display name', () => {
  const w = new World('live', ':memory:', clock);
  try {
    const a = { subject: 'twitch:123', name: 'A Citizen' },
      first = w.command(a, { type: 'join', argument: 'north' }, 'chat:1');
    const twice = w.command(a, { type: 'join', argument: 'north' }, 'chat:1');
    assert.deepEqual(twice, first);
    w.command({ ...a, name: 'Renamed Citizen' }, { type: 'join', argument: 'north' }, 'chat:2');
    assert.equal(w.snapshot().citizens, 1);
    assert.equal(w.character(first.characterId!).name, 'Renamed Citizen');
    assert.equal(w.character(first.characterId!).gold, 10);
    assert.equal(w.all('SELECT * FROM rewards').length, 1);
  } finally {
    w.close();
  }
});
test('equipment upgrades debit once, reject overspending and preserve ownership', () => {
  const w = demo();
  try {
    const before = w.character('sim-0001'),
      item = before.gear!.find((g) => g.slot === 'weapon')!;
    w.atomic(() => w.run('UPDATE characters SET gold=? WHERE id=?', item.cost, 'sim-0001'));
    const result = w.command(actor, { type: 'upgrade', argument: item.id }, 'upgrade-once');
    const after = w.character('sim-0001');
    assert.equal(after.gear!.find((g) => g.id === item.id)!.upgrade, item.upgrade + 1);
    assert.equal(after.gold, 10); // first valid action grants its separate, capped daily participation award
    assert.deepEqual(
      w.command(actor, { type: 'upgrade', argument: item.id }, 'upgrade-once'),
      result,
    );
    assert.equal(w.character('sim-0001').gold, 10);
    assert.throws(
      () => w.command(actor, { type: 'upgrade', argument: item.id }, 'upgrade-twice'),
      /need/,
    );
    assert.throws(
      () => w.command(actor, { type: 'equip', argument: 'sim-0002-iron-blade' }, 'wrong-owner'),
      /not in your inventory/,
    );
    assert.equal(w.get("SELECT COUNT(*) n FROM ledger WHERE reason='upgrade'")!.n, 1);
  } finally {
    w.close();
  }
});
test('deadlines, private ballots, pause/resume and deterministic once-only settlement', () => {
  const w = demo();
  try {
    borderFixture(w);
    const id = w.createChapter('east', 'crossroads', 60, 20261026);
    w.command(actor, { type: 'pledge' }, 'pledge-1');
    w.command(actor, { type: 'vote', argument: 'attack' }, 'vote-1');
    w.command(actor, { type: 'vote', argument: 'defend' }, 'vote-2');
    assert.equal(w.chapter(id, 'sim-0001').myVote, 'defend');
    assert.equal(w.chapter(id).votes, null);
    w.controlChapter(id, 'pause');
    w.advance(70);
    assert.equal(w.chapter(id).status, 'paused');
    w.controlChapter(id, 'resume');
    w.simulatePledges();
    w.advance(60);
    const ch = w.chapter(id);
    assert.equal(ch.status, 'resolved');
    assert.deepEqual(resolveBattle(ch.input!), ch.result);
    assert.ok(ch.votes);
    assert.throws(
      () => w.command(actor, { type: 'vote', argument: 'raid' }, 'late-vote'),
      /closed/,
    );
    const claims = w.get('SELECT COUNT(*) n FROM rewards')!.n,
      points = w.snapshot().kingdoms.map((k) => k.points);
    w.settleChapter(id);
    assert.equal(w.get('SELECT COUNT(*) n FROM rewards')!.n, claims);
    assert.deepEqual(
      w.snapshot().kingdoms.map((k) => k.points),
      points,
    );
    const frozen = ch.result!.inputHash;
    w.atomic(() => w.run('UPDATE characters SET xp=xp+1000 WHERE id=?', 'sim-0001'));
    assert.equal(w.chapter(id).result!.inputHash, frozen);
  } finally {
    w.close();
  }
});
test('one-sided chapter cancels without rewards or ownership change', () => {
  const w = demo();
  try {
    borderFixture(w);
    const id = w.createChapter('east', 'crossroads', 30);
    w.command(actor, { type: 'pledge' }, 'one-side');
    const count = w.get('SELECT COUNT(*) n FROM rewards')!.n;
    w.advance(30);
    assert.equal(w.chapter(id).status, 'cancelled');
    assert.equal(w.get('SELECT owner FROM territories WHERE id=?', 'crossroads')!.owner, 'north');
    assert.equal(w.get('SELECT COUNT(*) n FROM rewards')!.n, count);
  } finally {
    w.close();
  }
});
test('territory adjacency, capitals and once-daily target restrictions', () => {
  const w = demo();
  try {
    borderFixture(w);
    assert.throws(() => w.createChapter('east', 'northhold'), /border/);
    assert.throws(() => w.createChapter('east', 'frostpass'), /adjacent/);
    const id = w.createChapter('east', 'crossroads', 30);
    w.simulatePledges();
    w.advance(30);
    const owner = w.get('SELECT owner FROM territories WHERE id=?', 'crossroads')!.owner;
    assert.throws(
      () => w.createChapter(owner === 'east' ? 'north' : 'east', 'crossroads'),
      /already been contested/,
    );
    assert.equal(w.chapter(id).status, 'resolved');
  } finally {
    w.close();
  }
});
test('election eligibility, replaceable ballot and public quorum result', () => {
  const w = demo();
  try {
    const id = w.openElection('north');
    w.command(actor, { type: 'nominate' }, 'nominate-1');
    w.command({ subject: 'sim:sim-0002', name: 'Kaito' }, { type: 'nominate' }, 'nominate-2');
    w.advance(60);
    assert.equal(w.election(id).status, 'voting');
    const voters = w.all(
      'SELECT u.subject,u.name FROM eligibility e JOIN characters c ON c.id=e.character_id JOIN users u ON u.id=c.user_id WHERE e.election_id=? ORDER BY c.id LIMIT 30',
      id,
    );
    for (let i = 0; i < voters.length; i++)
      w.command(voters[i] as any, { type: 'elect', argument: 'sim-0001' }, `elect-${i}`);
    w.command(actor, { type: 'elect', argument: 'sim-0002' }, 'changed-ballot');
    assert.equal(w.election(id).ballots, 30);
    assert.ok(w.election(id).candidates.every((c) => c.votes === null));
    w.advance(90);
    assert.equal(w.election(id).winner, 'sim-0001');
    assert.equal(w.snapshot().kingdoms[0].lordId, 'sim-0001');
    const count = w.all('SELECT * FROM lords').length;
    w.settleElection(id);
    assert.equal(w.all('SELECT * FROM lords').length, count);
  } finally {
    w.close();
  }
});
test('no-quorum election does not invent a Lord', () => {
  const w = demo();
  try {
    const id = w.openElection('north');
    w.command(actor, { type: 'nominate' }, 'nomination');
    w.advance(151);
    assert.equal(w.election(id).winner, null);
    assert.match(w.election(id).reason!, /quorum/);
  } finally {
    w.close();
  }
});
test('season rollover keeps character XP/gear and snapshots standings once', () => {
  const w = demo();
  try {
    const before = w.character('sim-0001');
    w.advance(7 * 86400 + 1);
    assert.equal(w.snapshot().season.number, 2);
    assert.equal(w.character('sim-0001').xp, before.xp);
    assert.deepEqual(w.character('sim-0001').gear, before.gear);
    assert.equal(w.get('SELECT COUNT(*) n FROM season_awards')!.n, 603);
    w.rollSeason();
    assert.equal(w.get('SELECT COUNT(*) n FROM season_awards')!.n, 603);
    assert.ok(w.snapshot().kingdoms.every((k) => k.points === 0));
  } finally {
    w.close();
  }
});
test('SQLite restart preserves rewards, characters and battle inputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-')),
    file = join(directory, 'simulation.sqlite');
  let w = new World('simulation', file, clock);
  try {
    borderFixture(w);
    const id = w.createChapter('east', 'crossroads', 30, 123);
    w.simulatePledges();
    w.advance(31);
    const before = w.chapter(id);
    w.close();
    w = new World('simulation', file, clock);
    assert.equal(w.snapshot().citizens, 600);
    assert.deepEqual(w.chapter(id).result, before.result);
    assert.deepEqual(resolveBattle(w.chapter(id).input!), before.result);
    assert.throws(() => new World('live', file, clock), /mismatch/);
  } finally {
    w.close();
    removeOwnedTestDirectory(directory);
  }
});
test('scenario reset is deterministic apart from instance IDs, all references remain valid', () => {
  const a = demo(),
    b = demo();
  try {
    assert.deepEqual(a.character('sim-0001'), b.character('sim-0001'));
    a.reset('border-clash');
    b.reset('border-clash');
    a.advance(61);
    b.advance(61);
    assert.deepEqual(a.snapshot().chapter!.result, b.snapshot().chapter!.result);
    assert.deepEqual(a.all('PRAGMA foreign_key_check'), []);
    a.reset('first-citizen');
    assert.equal(a.snapshot().citizens, 0);
    assert.equal(a.snapshot().events.length, 1);
  } finally {
    a.close();
    b.close();
  }
});
