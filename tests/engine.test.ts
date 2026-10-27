import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, RULESET } from '../shared/catalog';
import type { BattleInput, ClassName, Tactic } from '../shared/types';
import {
  effectivePower,
  hash,
  levelFor,
  progress,
  random,
  resolveBattle,
  selectRoster,
  statsFor,
  tacticFor,
} from '../server/engine';

test('every XP boundary, maximum level and class power parity', () => {
  for (let level = 1; level <= 20; level++) {
    const threshold = 50 * (level - 1) * level;
    assert.equal(levelFor(threshold), level);
    if (level > 1) assert.equal(levelFor(threshold - 1), level - 1);
    const powers = Object.keys(CLASSES).map((c) => statsFor(c as ClassName, threshold, []).power);
    assert.deepEqual(powers, [
      128 + 17 * (level - 1),
      128 + 17 * (level - 1),
      128 + 17 * (level - 1),
    ]);
  }
  assert.equal(levelFor(1000000), 20);
  assert.deepEqual(progress(125), { level: 2, levelXp: 25, nextXp: 200 });
});
test('tactic ties and zero turnout choose defend', () => {
  assert.equal(tacticFor({ attack: 0, defend: 0, raid: 0 }), 'defend');
  assert.equal(tacticFor({ attack: 7, defend: 1, raid: 7 }), 'defend');
  assert.equal(tacticFor({ attack: 7, defend: 1, raid: 6 }), 'attack');
});
test('specified uint32 RNG and zero remapping are reproducible', () => {
  const a = random(123),
    b = random(123);
  assert.deepEqual(Array.from({ length: 100 }, a), Array.from({ length: 100 }, b));
  assert.equal(random(0)(), random(0x6d2b79f5)());
  assert.equal(random(1)(), 270369);
});
test('seeded roster is order invariant and capped at 50', () => {
  const roster = Array.from({ length: 600 }, (_, i) => ({ id: `citizen-${i}` }));
  assert.deepEqual(selectRoster(roster, 123), selectRoster([...roster].reverse(), 123));
  assert.equal(selectRoster(roster, 123).length, 50);
  assert.equal(effectivePower(Array.from({ length: 50 }, () => ({ power: 200 }))), 220);
  assert.equal(effectivePower([]), 0);
});
function fixture(tacticA: Tactic = 'attack', tacticB: Tactic = 'raid'): BattleInput {
  const stats = statsFor('vanguard', 300, []);
  return {
    seed: 20261026,
    ruleset: RULESET,
    attacker: 'east',
    defender: 'north',
    territory: 'crossroads',
    sides: [
      {
        kingdom: 'east',
        tactic: tacticA,
        roster: [{ id: 'a', name: 'Synthetic A', stats, power: stats.power }],
        pledged: 1,
        effective: 200,
      },
      {
        kingdom: 'north',
        tactic: tacticB,
        roster: [{ id: 'b', name: 'Synthetic B', stats, power: stats.power }],
        pledged: 1,
        effective: 200,
      },
    ],
  };
}
test('battle is deterministic, hashed, terrain/tactic adjusted and bounded', () => {
  const input = fixture(),
    a = resolveBattle(input),
    b = resolveBattle(structuredClone(input));
  assert.deepEqual(a, b);
  assert.equal(a.winner, 'east');
  assert.equal(a.inputHash, hash(input));
  assert.equal(a.rounds.length, 3);
  const rng = random(input.seed);
  for (const round of a.rounds) {
    assert.equal(round.rollA, 9500 + (rng() % 1001));
    assert.equal(round.rollB, 9500 + (rng() % 1001));
    assert.equal(round.scoreA, Math.floor((220 * round.rollA) / 10000));
    assert.equal(round.scoreB, Math.floor((206 * round.rollB) / 10000));
  }
  const invalid = fixture();
  invalid.sides[0].roster = [];
  assert.throws(() => resolveBattle(invalid));
});
test('battle output golden fixture records expected scores for stable rules', () => {
  // Reviewed rolls: A 9763/10042/10130 at power 220 => 214+220+222.
  // B 10160/9665/9683 at terrain-adjusted power 206 => 209+199+199.
  const result = resolveBattle(fixture());
  assert.deepEqual(
    { a: result.scoreA, b: result.scoreB, winner: result.winner },
    { a: 656, b: 607, winner: 'east' },
  );
});
