import type { PersonalRecap } from '../shared/companion';
import type { Character } from '../shared/types';
import { FACTIONS } from '../shared/catalog';
import { WORLD_TERRITORIES } from '../shared/expansion';
import type { World } from './world';

export function personalRecap(world: World, character: Character): PersonalRecap {
  const slotOrder = { weapon: 0, armor: 1, charm: 2 };
  const item = character.gear
    ?.filter((gear) => gear.equipped && gear.upgrade < 5)
    .sort((a, b) => a.cost - b.cost || slotOrder[a.slot] - slotOrder[b.slot])[0];
  const upgrade = item
    ? {
        definition: item.definition,
        name: item.name,
        level: item.upgrade + 1,
        cost: item.cost,
        shortfall: Math.max(0, item.cost - character.gold),
      }
    : null;
  const row = world.get(
    `SELECT ch.id, ch.status, ch.territory, ch.attacker, ch.resolved_at, p.kingdom,
            json_extract(ch.result, '$.winner') AS winner, r.xp, r.gold
       FROM participants p JOIN chapters ch ON ch.id=p.chapter_id
       LEFT JOIN rewards r ON r.character_id=p.character_id AND r.source_id=ch.id AND r.kind='battle'
      WHERE p.character_id=? AND ch.status IN ('resolved','cancelled')
      ORDER BY ch.resolved_at DESC, ch.rowid DESC LIMIT 1`,
    character.id,
  );
  if (!row) return { battle: null, upgrade };
  const territory = WORLD_TERRITORIES.find((t) => t.id === row.territory)?.name ?? row.territory;
  const outcome =
    row.status === 'cancelled'
      ? 'cancelled'
      : !row.winner
        ? 'draw'
        : row.winner === row.kingdom
          ? 'won'
          : 'lost';
  let summary = `The chapter at ${territory} closed without a fight.`;
  if (outcome === 'draw') summary = `Your battle at ${territory} ended in a draw. The border held.`;
  else if (outcome !== 'cancelled') {
    const victor = FACTIONS[row.winner as keyof typeof FACTIONS].name;
    summary = `You ${outcome}. ${victor} ${row.winner === row.attacker ? 'captured' : 'held'} ${territory}.`;
  }
  const xp = row.xp ?? 0,
    gold = row.gold ?? 0,
    expected = outcome === 'won' ? 30 : 20;
  let reward = `Battle reward +${xp} XP, +${gold} gold.`;
  if (outcome === 'cancelled') reward = 'Cancelled chapters award no XP or gold.';
  else if (row.xp == null) {
    const day = new Date(row.resolved_at).toISOString().slice(0, 10);
    const count = world.get(
      "SELECT COUNT(*) n FROM rewards WHERE character_id=? AND kind='battle' AND session=?",
      character.id,
      day,
    )!.n;
    reward =
      count >= 3
        ? 'No battle reward. You reached the three-battle daily limit.'
        : 'No battle reward was recorded.';
  } else if (xp < expected || gold < expected) reward += ' The UTC daily reward cap applied.';
  return { battle: { id: row.id, outcome, summary, xp, gold, reward }, upgrade };
}

export function formatPersonalRecap(recap: PersonalRecap): string {
  const lines = recap.battle ? [recap.battle.summary, recap.battle.reward] : [];
  const u = recap.upgrade;
  if (u)
    lines.push(
      u.shortfall > 0
        ? `Save ${u.shortfall} more gold for ${u.name} +${u.level} (${u.cost}g).`
        : `Upgrade ${u.name} to +${u.level} for ${u.cost}g. Try !upgrade ${u.definition}`,
    );
  else lines.push('Your equipped gear is fully upgraded.');
  return lines.join(' ');
}
