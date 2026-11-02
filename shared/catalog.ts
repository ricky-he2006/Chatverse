import type { Faction, ClassName, Tactic } from './types';
export const FACTIONS: Record<
  Faction,
  { name: string; subtitle: string; color: string; banner: string }
> = {
  north: { name: 'North Kingdom', subtitle: 'The Frostborn', color: '#78a6c6', banner: 'shield' },
  east: { name: 'East Kingdom', subtitle: 'The Sunblades', color: '#d28d83', banner: 'sun' },
  west: { name: 'West Kingdom', subtitle: 'The Shadowfell', color: '#9bb69c', banner: 'moon' },
};
export const CLASSES: Record<
  ClassName,
  { attack: number; defense: number; health: number; speed: number }
> = {
  vanguard: { attack: 14, defense: 12, health: 100, speed: 8 },
  ranger: { attack: 16, defense: 8, health: 90, speed: 11 },
  rogue: { attack: 16, defense: 6, health: 80, speed: 15 },
};
export const ITEMS = [
  {
    id: 'iron-blade',
    name: 'Ironbound Blade',
    slot: 'weapon',
    icon: 'sword',
    cost: 60,
    attack: 4,
    defense: 0,
    health: 0,
    speed: 0,
    flavor: 'Forged for the first chapter of your story.',
  },
  {
    id: 'ranger-bow',
    name: 'Wayfinder Bow',
    slot: 'weapon',
    icon: 'bow',
    cost: 60,
    attack: 4,
    defense: 0,
    health: 0,
    speed: 0,
    flavor: 'For those who follow a different path.',
  },
  {
    id: 'shadow-dagger',
    name: 'Dusksteel Dagger',
    slot: 'weapon',
    icon: 'dagger',
    cost: 60,
    attack: 4,
    defense: 0,
    health: 0,
    speed: 0,
    flavor: 'A quiet edge beneath the western moon.',
  },
  {
    id: 'travelers-armor',
    name: 'Traveler’s Mantle',
    slot: 'armor',
    icon: 'armor',
    cost: 60,
    attack: 0,
    defense: 3,
    health: 0,
    speed: 0,
    flavor: 'Every great journey begins well prepared.',
  },
  {
    id: 'hearth-charm',
    name: 'Hearthstone Charm',
    slot: 'charm',
    icon: 'charm',
    cost: 60,
    attack: 0,
    defense: 0,
    health: 10,
    speed: 0,
    flavor: 'A little piece of home, wherever you go.',
  },
] as const;
export const TACTICS: Tactic[] = ['attack', 'defend', 'raid'];
export const RULESET = 'chatverse-v1';
export const TERRITORIES: {
  id: string;
  name: string;
  owner: Faction;
  capital: boolean;
  x: number;
  y: number;
  neighbors: string[];
}[] = [
  {
    id: 'northhold',
    name: 'Northhold',
    owner: 'north',
    capital: true,
    x: 40,
    y: 17,
    neighbors: ['frostpass'],
  },
  {
    id: 'frostpass',
    name: 'Frostpass',
    owner: 'north',
    capital: false,
    x: 36,
    y: 36,
    neighbors: ['northhold', 'crossroads'],
  },
  {
    id: 'eastkeep',
    name: 'Eastkeep',
    owner: 'east',
    capital: true,
    x: 83,
    y: 40,
    neighbors: ['sunreach'],
  },
  {
    id: 'sunreach',
    name: 'Sunreach',
    owner: 'east',
    capital: false,
    x: 68,
    y: 48,
    neighbors: ['eastkeep', 'crossroads'],
  },
  {
    id: 'westspire',
    name: 'Westspire',
    owner: 'west',
    capital: true,
    x: 18,
    y: 76,
    neighbors: ['shadegrove'],
  },
  {
    id: 'shadegrove',
    name: 'Shadegrove',
    owner: 'west',
    capital: false,
    x: 34,
    y: 63,
    neighbors: ['westspire', 'crossroads'],
  },
  {
    id: 'crossroads',
    name: 'The Crossroads',
    owner: 'north',
    capital: false,
    x: 49,
    y: 51,
    neighbors: ['frostpass', 'sunreach', 'shadegrove'],
  },
];
export const SCENARIOS = [
  {
    id: 'baseline',
    name: 'The living realm',
    description: '600 citizens. Three kingdoms. A new chapter waiting to be written.',
  },
  {
    id: 'border-clash',
    name: 'The battle for Crossroads',
    description: 'Rival banners, a 60-second council, and one contested border.',
  },
  {
    id: 'election',
    name: 'A crown for the people',
    description: 'A North Kingdom election with eligible citizens and two candidates.',
  },
  {
    id: 'first-citizen',
    name: 'A fresh beginning',
    description: 'An empty realm. Become its very first citizen.',
  },
  {
    id: 'season-close',
    name: 'The turning of an age',
    description: 'A populated campaign with 90 seconds until the next season.',
  },
];
