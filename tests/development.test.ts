import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { resolveBattle } from '../server/engine';
test('territory development debits personal gold once, enforces ownership and stale costs, and caps at three levels', () => {
  const w = new World('simulation', ':memory:');
  try {
    const id = w.get("SELECT id FROM characters WHERE kingdom='north' LIMIT 1")!.id,
      enemy = w.get("SELECT id FROM characters WHERE kingdom='east' LIMIT 1")!.id;
    w.run('UPDATE characters SET gold=1000 WHERE id=?', id);
    const upgrade = w.upgradeDistrict(id, 'frostpass', 0, 'district:one');
    assert.equal(upgrade.level, 1);
    w.upgradeDistrict(id, 'frostpass', 0, 'district:one');
    assert.equal(w.character(id).gold, 900);
    assert.throws(
      () => w.upgradeDistrict(enemy, 'frostpass', 1, 'district:enemy'),
      /owning kingdom/,
    );
    assert.throws(
      () => w.upgradeDistrict(id, 'northhold', 0, 'district:capital'),
      /border territory/,
    );
    assert.throws(
      () => w.upgradeDistrict(id, 'winter-crown', 0, 'district:locked'),
      /border territory/,
    );
    assert.throws(() => w.upgradeDistrict(id, 'frostpass', 0, 'district:stale'), /changed/);
    assert.equal(w.character(id).gold, 900);
    w.upgradeDistrict(id, 'frostpass', 1, 'district:two');
    w.upgradeDistrict(id, 'frostpass', 2, 'district:three');
    assert.equal(w.character(id).gold, 550);
    assert.throws(() => w.upgradeDistrict(id, 'frostpass', 3, 'district:four'), /fully fortified/);
    const territory = w.snapshot().territories.find((t) => t.id === 'frostpass')!;
    assert.deepEqual(territory.development, { level: 3, healthBonus: 180, nextCost: null });
    assert.equal(
      w.get("SELECT COUNT(*) n FROM ledger WHERE character_id=? AND reason='district_upgrade'", id)!
        .n,
      3,
    );
  } finally {
    w.close();
  }
});
test('a complete fortified fight freezes v3 defense, replays deterministically, pays participants and resets captured defenses', () => {
  const w = new World('simulation', ':memory:');
  try {
    const id = w.get("SELECT id FROM characters WHERE kingdom='north' LIMIT 1")!.id;
    w.run('UPDATE characters SET gold=1000 WHERE id=?', id);
    w.upgradeDistrict(id, 'frostpass', 0, 'fight:district');
    w.run("UPDATE chapters SET status='cancelled' WHERE status IN('open','paused')");
    w.run("UPDATE territories SET owner='east',last_session=NULL WHERE id='crossroads'");
    w.run("UPDATE territories SET last_session=NULL WHERE id='frostpass'");
    w.run("UPDATE characters SET xp=19000 WHERE kingdom='east'");
    w.run("UPDATE characters SET xp=0 WHERE kingdom='north'");
    const battle = w.createChapter('east', 'frostpass', 30, 42);
    w.simulatePledges();
    w.advance(31);
    const settled = w.chapter(battle);
    assert.equal(settled.status, 'resolved');
    assert.equal(settled.input!.ruleset, 'chatverse-v3');
    assert.equal(settled.input!.sides[1].districtLevel, 1);
    assert.equal(settled.input!.sides[1].maxHealth, 1980 + 60);
    assert.equal(settled.result!.winner, 'east');
    assert.deepEqual(resolveBattle(settled.input!), settled.result);
    assert.equal(w.snapshot().territories.find((t) => t.id === 'frostpass')!.owner, 'east');
    assert.equal(w.snapshot().territories.find((t) => t.id === 'frostpass')!.development!.level, 0);
    assert(
      w.get("SELECT COUNT(*) n FROM rewards WHERE source_id=? AND kind='battle'", battle)!.n > 0,
    );
    const awards = w.get('SELECT COUNT(*) n FROM rewards WHERE source_id=?', battle)!.n;
    w.tick();
    assert.equal(w.get('SELECT COUNT(*) n FROM rewards WHERE source_id=?', battle)!.n, awards);
    const forged = structuredClone(settled.input!);
    forged.sides[0].districtLevel = 3;
    assert.throws(() => resolveBattle(forged), /fortress health/);
  } finally {
    w.close();
  }
});
