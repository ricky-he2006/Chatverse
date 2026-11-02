import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { battleFrame, battleConsequence } from '../shared/battle-presentation';
import { nextOverlayNotice } from '../shared/overlay';
import type { WorldEvent, Chapter, BattleResult } from '../shared/types';

test('settlement suppresses duplicate winner and bundled rally notices, but preserves a named Stream Moment', () => {
  const event = (id: number, type: string) => ({ id, type, title: type }) as WorldEvent;
  assert.equal(nextOverlayNotice([event(4, 'battle'), event(3, 'simulation')], 2, true), undefined);
  assert.equal(
    nextOverlayNotice([event(5, 'milestone'), event(4, 'battle')], 2, true)?.type,
    'milestone',
  );
  assert.equal(nextOverlayNotice([event(5, 'milestone')], 5, true), undefined);
  assert.equal(nextOverlayNotice([event(4, 'battle')], 2, false)?.type, 'battle');
});

test('draw presentation preserves the defending banner; legacy score recordings do not invent fortress HP', () => {
  const result: BattleResult = {
    winner: null,
    rounds: [{ round: 1, rollA: 10000, rollB: 10000, scoreA: 12, scoreB: 12 }],
    scoreA: 12,
    scoreB: 12,
    inputHash: 'input',
    outputHash: 'output',
    ruleset: 'legacy',
  };
  const ch = { attacker: 'east', defender: 'north', territory: 'frostpass', result } as Chapter;
  assert.match(battleConsequence(ch), /Draw.*Frostpass stays with North Kingdom/);
  assert.equal(battleFrame(result, 1).damageA, 12);
  assert.equal(result.maxHealthA, undefined);
});
for (const raid of [false, true])
  test(`Frostpass recorded ${raid ? 'capture' : 'hold'} replay is exact and read-only`, () => {
    const w = new World('simulation', ':memory:', () => Date.UTC(2026, 9, 31, 19));
    try {
      const id = w.createChapter('east', 'frostpass', 180, 2);
      w.simulatePledges(id);
      if (raid)
        w.command(
          { subject: 'sim:sim-0223', name: 'Ari Wintermere' },
          { type: 'vote', argument: 'raid' },
          'raid',
        );
      const ch = w.completeSimulationBattle(id),
        result = ch.result!;
      const before = JSON.stringify(w.all('SELECT * FROM rewards'));
      for (let n = 0; n <= 3; n++) {
        const f = battleFrame(result, n);
        assert.equal(
          f.healthA,
          result.maxHealthA! - result.rounds.slice(0, n).reduce((a, r) => a + r.scoreB, 0),
        );
        assert.equal(
          f.healthB,
          result.maxHealthB! - result.rounds.slice(0, n).reduce((a, r) => a + r.scoreA, 0),
        );
      }
      assert.equal(battleFrame(result, 3).healthA, result.healthA);
      assert.equal(battleFrame(result, 3).healthB, result.healthB);
      assert.match(battleConsequence(ch), raid ? /captured/ : /held/);
      assert.equal(JSON.stringify(w.all('SELECT * FROM rewards')), before);
    } finally {
      w.close();
    }
  });
