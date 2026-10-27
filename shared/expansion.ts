import { TERRITORIES } from './catalog';
import type { Faction, Territory } from './types';

export const GROWTH_RULESET = 'chatverse-v2';
export const MILESTONES = [25, 100, 250, 500];
export function growthFor(population: number) {
  const growthLevel = MILESTONES.filter((n) => population >= n).length;
  return {
    populationPeak: population,
    growthLevel,
    healthBonusBp: growthLevel * 500,
    fortressHealth: 1800 + growthLevel * 90,
    nextExpansionAt: MILESTONES[growthLevel] ?? null,
  };
}
const positions: Record<string, [number, number]> = {
  northhold: [20, 29],
  frostpass: [29, 65],
  eastkeep: [60, 35],
  sunreach: [65, 67],
  westspire: [89, 28],
  shadegrove: [81, 70],
  crossroads: [47, 69],
};
type Frontier = Territory & { unlockAt?: number; home: Faction };
export const WORLD_TERRITORIES: Frontier[] = TERRITORIES.map((t) => ({
  ...t,
  x: positions[t.id][0],
  y: positions[t.id][1],
  neighbors: [...t.neighbors],
  home: t.owner,
}));
const frontiers: Record<Faction, [string, string, number, number][]> = {
  north: [
    ['glacier-watch', 'Glacier Watch', 12, 65],
    ['frosthaven', 'Frosthaven', 32, 35],
    ['skyreach', 'Skyreach', 7, 30],
    ['winter-crown', 'Winter Crown', 38, 19],
  ],
  east: [
    ['amber-fields', 'Amber Fields', 56, 86],
    ['sunspire', 'Sunspire', 72, 39],
    ['dawnport', 'Dawnport', 70, 86],
    ['solstice-gate', 'Solstice Gate', 49, 37],
  ],
  west: [
    ['moonwell', 'Moonwell', 93, 78],
    ['twilight-grove', 'Twilight Grove', 79, 48],
    ['starfall-keep', 'Starfall Keep', 95, 49],
    ['eclipse-citadel', 'Eclipse Citadel', 85, 12],
  ],
};
for (const home of Object.keys(frontiers) as Faction[]) {
  let previous = home === 'north' ? 'frostpass' : home === 'east' ? 'sunreach' : 'shadegrove';
  frontiers[home].forEach(([id, name, x, y], i) => {
    WORLD_TERRITORIES.find((t) => t.id === previous)!.neighbors.push(id);
    WORLD_TERRITORIES.push({
      id,
      name,
      x,
      y,
      owner: home,
      home,
      capital: false,
      neighbors: [previous],
      unlockAt: MILESTONES[i],
    });
    previous = id;
  });
}
export const RACES = [
  {
    id: 'rally',
    title: 'Rally the realm',
    description: 'First kingdom to pledge five different citizens to new council chapters.',
    metric: 'pledge',
    scope: 'kingdom',
    target: 5,
    xp: 15,
    gold: 20,
  },
  {
    id: 'forge',
    title: 'Firstlight Forge',
    description: 'First citizen to upgrade a weapon, armor and charm after this race opens.',
    metric: 'upgrade',
    scope: 'citizen',
    target: 3,
    xp: 20,
    gold: 30,
  },
  {
    id: 'welcome',
    title: 'Welcome Wagon',
    description: 'First kingdom to welcome ten brand-new citizens after this race opens.',
    metric: 'join',
    scope: 'kingdom',
    target: 10,
    xp: 10,
    gold: 15,
  },
] as const;
export type RealmChallenge = {
  id: string;
  title: string;
  description: string;
  scope: string;
  target: number;
  xp: number;
  gold: number;
  status: string;
  winner: string | null;
  openedAt: number;
  expiresAt: number;
  leaders: { id: string; name: string; score: number }[];
};
