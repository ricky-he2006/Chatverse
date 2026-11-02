import type { Chapter, BattleResult } from './types';
import { FACTIONS } from './catalog';
import { WORLD_TERRITORIES } from './expansion';
export function battleFrame(result: BattleResult, exchanges: number) {
  const rounds = result.rounds.slice(0, Math.max(0, Math.min(result.rounds.length, exchanges)));
  const damageA = rounds.reduce((n, r) => n + r.scoreA, 0);
  const damageB = rounds.reduce((n, r) => n + r.scoreB, 0);
  return {
    damageA,
    damageB,
    healthA: Math.max(0, (result.maxHealthA ?? 0) - damageB),
    healthB: Math.max(0, (result.maxHealthB ?? 0) - damageA),
    exchange: rounds.at(-1),
  };
}
export function battleConsequence(ch: Chapter) {
  const place =
    WORLD_TERRITORIES.find((t) => t.id === ch.territory)?.name ?? ch.territory.replaceAll('-', ' ');
  return !ch.result?.winner
    ? `Draw · ${place} stays with ${FACTIONS[ch.defender].name}`
    : ch.result.winner === ch.attacker
      ? `${FACTIONS[ch.attacker].name} captured ${place}`
      : `${FACTIONS[ch.defender].name} held ${place}`;
}
