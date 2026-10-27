import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { growthFor } from '../shared/expansion';
import { resolveBattle } from '../server/engine';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { removeOwnedTestDirectory } from './helpers';

const clock = () => Date.UTC(2026, 9, 27, 18);
test('growth unlocks exactly at thresholds, caps health, and cannot shrink or overwrite conquest', () => {
  assert.deepEqual(
    [0, 24, 25, 99, 100, 249, 250, 499, 500, 50000].map((n) => growthFor(n).fortressHealth),
    [1800, 1800, 1890, 1890, 1980, 1980, 2070, 2070, 2160, 2160],
  );
  const w = new World('live', ':memory:', clock);
  try {
    assert.equal(w.snapshot().territories.length, 7);
    for (let i = 0; i < 25; i++)
      w.command(
        { subject: `twitch:${i}`, name: `Citizen ${i}` },
        { type: 'join', argument: 'north' },
        `join:${i}`,
      );
    assert.equal(w.snapshot().kingdoms[0].fortressHealth, 1890);
    assert.equal(w.snapshot().territories.length, 8);
    w.atomic(() => {
      w.run("UPDATE territories SET owner='east' WHERE id='glacier-watch'");
      w.run("UPDATE characters SET kingdom='west'");
      w.syncGrowth();
    });
    assert.equal(w.snapshot().kingdoms[0].populationPeak, 25);
    assert.equal(w.snapshot().territories.find((t) => t.id === 'glacier-watch')!.owner, 'east');
    assert.throws(() => w.createChapter('north', 'winter-crown'));
  } finally {
    w.close();
  }
});
test('new identities race once; first winner and contributor rewards are atomic and isolated', () => {
  const w = new World('live', ':memory:', clock);
  try {
    const actor = { subject: 'twitch:1', name: 'First' };
    w.command(actor, { type: 'join', argument: 'north' }, 'j1');
    w.command(actor, { type: 'join', argument: 'north' }, 'j1');
    w.command(actor, { type: 'join', argument: 'north' }, 'j2');
    assert.equal(
      w.challengeSnapshots().find((r) => r.title === 'Welcome Wagon')!.leaders[0].score,
      1,
    );
    for (let i = 2; i <= 10; i++)
      w.command(
        { subject: `twitch:${i}`, name: `Citizen ${i}` },
        { type: 'join', argument: 'north' },
        `j${i + 1}`,
      );
    const race = w.challengeSnapshots().find((r) => r.title === 'Welcome Wagon')!;
    assert.equal(race.winner, 'North Kingdom');
    assert.equal(w.all("SELECT * FROM rewards WHERE kind='challenge'").length, 10);
    for (let i = 11; i <= 21; i++)
      w.command(
        { subject: `twitch:${i}`, name: `Citizen ${i}` },
        { type: 'join', argument: 'east' },
        `j${i + 1}`,
      );
    assert.equal(w.challengeSnapshots().find((r) => r.id === race.id)!.winner, 'North Kingdom');
    assert.equal(w.all("SELECT * FROM rewards WHERE kind='challenge'").length, 10);
    const sim = new World('simulation', ':memory:', clock);
    try {
      assert.equal(
        sim.challengeSnapshots().find((r) => r.title === 'Welcome Wagon')!.leaders.length,
        0,
      );
    } finally {
      sim.close();
    }
  } finally {
    w.close();
  }
});
test('forge requires three distinct successful slot upgrades and expires at its deadline', () => {
  const w = new World('simulation', ':memory:', clock);
  try {
    const c = w.character('sim-0001');
    const actor = { subject: 'sim:sim-0001', name: c.name };
    w.run('UPDATE characters SET gold=10000 WHERE id=?', c.id);
    const gear = c.gear!.filter((g) => g.equipped);
    const weapon = gear.find((g) => g.slot === 'weapon')!;
    w.command(actor, { type: 'upgrade', argument: weapon.id }, 'u1');
    w.command(actor, { type: 'upgrade', argument: weapon.id }, 'u2');
    assert.equal(
      w.challengeSnapshots().find((r) => r.title === 'Firstlight Forge')!.leaders[0].score,
      1,
    );
    for (const g of gear.filter((g) => g.slot !== 'weapon'))
      w.command(actor, { type: 'upgrade', argument: g.id }, `u:${g.id}`);
    assert.equal(
      w.challengeSnapshots().find((r) => r.title === 'Firstlight Forge')!.winner,
      c.name,
    );
    w.clockOffset = 86400000;
    w.command({ subject: 'sim:late', name: 'Late' }, { type: 'join', argument: 'west' }, 'late');
    const welcome = w.challengeSnapshots().find((r) => r.title === 'Welcome Wagon')!;
    assert.equal(welcome.status, 'expired');
    assert.equal(welcome.leaders.length, 0);
  } finally {
    w.close();
  }
});
test('v2 battles freeze and validate population health while preserving reproducibility', () => {
  const w = new World('simulation', ':memory:', clock);
  try {
    w.run("UPDATE territories SET owner='north',last_session=NULL WHERE id='crossroads'");
    const id = w.createChapter('east', 'crossroads', 60, 42);
    w.simulatePledges();
    w.advance(61);
    const ch = w.chapter(id);
    assert.equal(ch.input!.ruleset, 'chatverse-v2');
    assert.deepEqual(resolveBattle(ch.input!), ch.result);
    assert.equal(ch.result!.maxHealthA, 1980);
    assert.equal(ch.result!.healthA, 1980 - ch.result!.scoreB);
    w.command({ subject: 'sim:new', name: 'New' }, { type: 'join', argument: 'east' }, 'new');
    assert.deepEqual(resolveBattle(ch.input!), ch.result);
    const invalid = structuredClone(ch.input!);
    invalid.sides[0].maxHealth = 99999;
    assert.throws(() => resolveBattle(invalid));
    const annihilation = structuredClone(ch.input!);
    annihilation.sides.forEach((s) => (s.effective = 100000));
    const draw = resolveBattle(annihilation);
    assert.equal(draw.winner, null);
    assert.equal(draw.healthA, 0);
    assert.equal(draw.healthB, 0);
    assert.equal(draw.rounds[1].scoreA, 0);
    assert.equal(draw.rounds[1].scoreB, 0);
  } finally {
    w.close();
  }
});

test('v1 database migration preserves characters, conquered borders and rewards on restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-expansion-'));
  const path = join(directory, 'world.sqlite');
  let w = new World('simulation', path, clock);
  try {
    w.command(
      { subject: 'sim:persist', name: 'Persisted' },
      { type: 'join', argument: 'north' },
      'persist',
    );
    const race = w.challengeSnapshots().find((r) => r.title === 'Welcome Wagon')!;
    w.run("UPDATE territories SET owner='west' WHERE id='glacier-watch'");
    const count = w.snapshot().citizens;
    w.setSimulationSupporter('sim-0001', 2);
    w.run('UPDATE environment SET version=1');
    w.close();
    w = new World('simulation', path, clock);
    assert.equal(w.get('SELECT version FROM environment')!.version, 3);
    assert.equal(w.snapshot().citizens, count);
    assert.equal(w.character('sim-0001').supporter!.tier, 2);
    assert.equal(w.snapshot().territories.find((t) => t.id === 'glacier-watch')!.owner, 'west');
    assert.equal(w.challengeSnapshots().find((r) => r.id === race.id)!.leaders[0].score, 1);
    w.command(
      { subject: 'sim:persist', name: 'Persisted' },
      { type: 'join', argument: 'north' },
      'persist',
    );
    assert.equal(w.challengeSnapshots().find((r) => r.id === race.id)!.leaders[0].score, 1);
    w.advance(86401);
    assert.equal(w.challengeSnapshots().filter((r) => r.status === 'open').length, 3);
    assert.ok(w.challengeSnapshots().some((r) => r.id === race.id && r.status === 'expired'));
  } finally {
    w.close();
    removeOwnedTestDirectory(directory);
  }
});
