import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareJudgeDemo } from '../scripts/judge-demo';
import { World } from '../server/world';
import { resolveBattle } from '../server/engine';
import { removeOwnedTestDirectory } from './helpers';

test('judge rehearsal persists a paused seeded battle and supports earned-gold development through the real engine', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-judge-demo-'));
  try {
    const manifest = prepareJudgeDemo(directory);
    assert.equal(manifest.citizens, 720);
    assert.equal(manifest.northPopulation, 220);
    assert.equal(manifest.battle.seed, 20261030);
    const w = new World(
      'simulation',
      join(directory, 'simulation-emberwatch.sqlite'),
      undefined,
      'emberwatch',
    );
    try {
      assert.equal(w.chapter(manifest.battleId).status, 'paused');
      assert.equal(w.settings().autoChapters, false);
      const before = w.character(manifest.citizen),
        weapon = before.gear!.find((g) => g.slot === 'weapon' && g.equipped)!;
      w.command(
        { subject: 'sim:' + before.id, name: before.name },
        { type: 'upgrade', argument: weapon.id },
        'judge-upgrade',
      );
      const after = w.character(manifest.citizen);
      assert(after.gold < before.gold);
      assert(after.gold >= 100);
      w.upgradeDistrict(manifest.citizen, 'frostpass', 0, 'judge-fortification');
      w.controlChapter(manifest.battleId, 'resume');
      const resolved = w.completeSimulationBattle(manifest.battleId);
      assert.equal(resolved.status, 'resolved');
      assert.equal(resolved.input!.ruleset, 'chatverse-v3');
      assert.equal(resolved.input!.sides[1].districtLevel, 1);
      assert.deepEqual(resolveBattle(resolved.input!), resolved.result);
    } finally {
      w.close();
    }
    const live = new World('live', join(directory, 'live.sqlite'));
    try {
      assert.equal(live.snapshot().citizens, 0);
    } finally {
      live.close();
    }
  } finally {
    removeOwnedTestDirectory(directory);
  }
});

test('judge preparation refuses existing data without touching files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'chatverse-judge-refusal-'));
  try {
    const path = join(directory, 'keep.txt');
    writeFileSync(path, 'keep this world');
    assert.throws(() => prepareJudgeDemo(directory), /empty directory/);
    assert.equal(readFileSync(path, 'utf8'), 'keep this world');
  } finally {
    removeOwnedTestDirectory(directory);
  }
});
