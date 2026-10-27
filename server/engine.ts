import { createHash } from 'node:crypto';
import { CLASSES, ITEMS, RULESET } from '../shared/catalog';
import type { BattleInput, BattleResult, ClassName, Stats, Tactic } from '../shared/types';
export const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function levelFor(xp: number) {
  let level = 1;
  while (level < 20 && xp >= 50 * level * (level + 1)) level++;
  return level;
}
export function progress(xp: number) {
  const level = levelFor(xp);
  return { level, levelXp: xp - 50 * (level - 1) * level, nextXp: level === 20 ? 0 : 100 * level };
}
export function statsFor(
  className: ClassName,
  xp: number,
  gear: { definition: string; upgrade: number }[],
): Stats {
  const level = levelFor(xp),
    base = CLASSES[className];
  const stats = {
    attack: base.attack + 2 * (level - 1),
    defense: base.defense + 2 * (level - 1),
    health: base.health + 5 * (level - 1),
    speed: base.speed + level - 1,
  };
  for (const gearItem of gear) {
    const def = ITEMS.find((i) => i.id === gearItem.definition);
    if (!def) continue;
    stats.attack += def.attack + (def.slot === 'weapon' ? 2 * gearItem.upgrade : 0);
    stats.defense += def.defense + (def.slot === 'armor' ? 2 * gearItem.upgrade : 0);
    stats.health += def.health + (def.slot === 'charm' ? 5 * gearItem.upgrade : 0);
  }
  return {
    ...stats,
    power: 4 * stats.attack + 3 * stats.defense + Math.floor(stats.health / 5) + 2 * stats.speed,
  };
}
export function random(seed: number) {
  let n = seed >>> 0 || 0x6d2b79f5;
  return () => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return n >>> 0;
  };
}
export function tacticFor(votes: Record<Tactic, number>): Tactic {
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] === 0 || ranked[0][1] === ranked[1][1] ? 'defend' : (ranked[0][0] as Tactic);
}
export function selectRoster<T extends { id: string }>(roster: T[], seed: number) {
  return [...roster]
    .sort((a, b) => {
      const x = hash(`${seed}|${a.id}`),
        y = hash(`${seed}|${b.id}`);
      return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : 1;
    })
    .slice(0, 50);
}
export function effectivePower(roster: { power: number }[]) {
  if (!roster.length) return 0;
  return Math.floor(
    (Math.floor(roster.reduce((s, r) => s + r.power, 0) / roster.length) *
      (10000 + Math.min(1000, 50 * roster.length))) /
      10000,
  );
}
export function resolveBattle(input: BattleInput): BattleResult {
  if (
    input.ruleset !== RULESET ||
    input.sides.some(
      (s) =>
        !s.roster.length ||
        s.roster.length > 50 ||
        s.roster.some((c) => !Number.isSafeInteger(c.power) || c.power < 1 || c.power > 100000),
    )
  )
    throw new Error('Invalid battle inputs');
  const rng = random(input.seed),
    [a, b] = input.sides;
  const beats: Record<Tactic, Tactic> = { attack: 'raid', raid: 'defend', defend: 'attack' };
  const adjusted = (effective: number, terrain: number, tactic: number) =>
    Math.floor((Math.floor((effective * terrain) / 10000) * tactic) / 10000);
  const pa = adjusted(a.effective, 10000, beats[a.tactic] === b.tactic ? 11000 : 10000);
  const pb = adjusted(b.effective, 10300, beats[b.tactic] === a.tactic ? 11000 : 10000);
  const rounds = Array.from({ length: 3 }, (_, i) => {
    const rollA = 9500 + (rng() % 1001),
      rollB = 9500 + (rng() % 1001);
    return {
      round: i + 1,
      rollA,
      rollB,
      scoreA: Math.floor((pa * rollA) / 10000),
      scoreB: Math.floor((pb * rollB) / 10000),
    };
  });
  const scoreA = rounds.reduce((s, r) => s + r.scoreA, 0),
    scoreB = rounds.reduce((s, r) => s + r.scoreB, 0);
  const canonical = {
    winner: scoreA === scoreB ? null : scoreA > scoreB ? input.attacker : input.defender,
    rounds,
    scoreA,
    scoreB,
    ruleset: RULESET,
  };
  return { ...canonical, inputHash: hash(input), outputHash: hash(canonical) };
}
export class RuleError extends Error {
  constructor(
    message: string,
    public code = 'RULE_VIOLATION',
    public status = 422,
  ) {
    super(message);
  }
}
