import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../server/world';
import { personalRecap, formatPersonalRecap } from '../server/personal-recap';
import type { Faction } from '../shared/types';

function campaign() {
  let time = Date.UTC(2026, 9, 31, 16);
  const world = new World('live', ':memory:', () => time);
  function join(name: string, kingdom: Faction) {
    const actor = { subject: 'twitch:' + name, name };
    const id = world.command(
      actor,
      { type: 'join', argument: kingdom },
      'join-' + name,
    ).characterId!;
    return { actor, id, recap: () => personalRecap(world, world.character(id)) };
  }
  return {
    world,
    join,
    advance: (ms: number) => {
      time += ms;
      world.tick();
    },
  };
}

test('personal chapter receipt follows the pledge and actual award through spending and a return visit', () => {
  const { world, join, advance } = campaign();
  try {
    const east = join('EastCitizen', 'east'),
      north = join('Defender', 'north');
    const spectator = join('Spectator', 'east');
    assert.equal(east.recap().battle, null);
    assert.equal(east.recap().upgrade?.shortfall, 20);
    assert.match(formatPersonalRecap(east.recap()), /Save 20 more gold for Ironbound Blade/);
    const chapter = world.createChapter('east', 'crossroads', 60, 23);
    for (const [citizen, tactic] of [
      [east, 'attack'],
      [north, 'defend'],
    ] as const) {
      world.command(citizen.actor, { type: 'pledge' }, 'pledge-' + citizen.id);
      world.command(citizen.actor, { type: 'vote', argument: tactic }, 'vote-' + citizen.id);
    }
    advance(61000);
    assert.equal(world.chapter(chapter).result!.winner, 'north');
    const recap = east.recap();
    assert.equal(recap.battle?.outcome, 'lost');
    assert.equal(recap.battle?.xp, 20);
    assert.equal(recap.battle?.gold, 20);
    assert.equal(north.recap().battle?.gold, 30);
    assert.equal(spectator.recap().battle, null);
    assert.equal(recap.upgrade?.shortfall, 0);
    assert.match(
      formatPersonalRecap(recap),
      /North Kingdom held The Crossroads.*\+20 XP, \+20 gold.*!upgrade iron-blade/,
    );
    world.command(east.actor, { type: 'upgrade', argument: recap.upgrade!.definition }, 'spend');
    assert.equal(east.recap().upgrade!.shortfall, 30);
    advance(86400000);
    world.command(east.actor, { type: 'join', argument: 'north' }, 'switch-banner');
    assert.deepEqual(east.recap().battle, recap.battle);
    assert.equal(
      world.all("SELECT * FROM rewards WHERE source_id=? AND kind='battle'", chapter).length,
      2,
    );
  } finally {
    world.close();
  }
});

test('recap distinguishes a clipped daily award, exhausted battle slots and a cancelled pledge', () => {
  const { world, join, advance } = campaign();
  try {
    const east = join('Attacker', 'east'),
      north = join('Defender', 'north');
    world.reward(east.id, 'earlier-challenge', 'challenge', 87, 90);
    for (let i = 0; i < 3; i++) world.reward(north.id, 'earlier-battle-' + i, 'battle', 20, 20);
    const chapter = world.createChapter('east', 'crossroads', 60, 23);
    world.command(east.actor, { type: 'pledge' }, 'pledge-east');
    world.command(north.actor, { type: 'pledge' }, 'pledge-north');
    advance(61000);
    assert.equal(east.recap().battle?.id, chapter);
    assert.equal(east.recap().battle?.xp, 3);
    assert.equal(east.recap().battle?.gold, 0);
    assert.match(east.recap().battle!.reward, /daily reward cap/);
    assert.equal(north.recap().battle?.gold, 0);
    assert.match(north.recap().battle!.reward, /three-battle daily limit/);
    advance(86400000);
    const next = world.createChapter('east', 'crossroads', 60, 23);
    world.command(east.actor, { type: 'pledge' }, 'next-pledge');
    world.controlChapter(next, 'cancel');
    assert.equal(east.recap().battle?.outcome, 'cancelled');
    assert.equal(east.recap().battle?.xp, 0);
    assert.equal(north.recap().battle?.id, chapter);
  } finally {
    world.close();
  }
});
