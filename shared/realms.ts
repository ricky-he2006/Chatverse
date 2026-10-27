import type { Faction, Mode } from './types';

export type RealmTheme = 'frost' | 'ember' | 'moon' | 'verdant';
export type RealmIdentity = {
  id: string;
  name: string;
  streamer: string;
  theme: RealmTheme;
  color: string;
  sigil: string;
  description: string;
  x: number;
  y: number;
};
export const REALMS: RealmIdentity[] = [
  {
    id: 'home',
    name: 'The Everfall Realm',
    streamer: '@EverfallHost',
    theme: 'frost',
    color: '#8bbcd1',
    sigil: '✦',
    description: 'Ancient peaks. Familiar faces. The place your story began.',
    x: 24,
    y: 32,
  },
  {
    id: 'emberwatch',
    name: 'Emberwatch Dominion',
    streamer: '@EmberPilot',
    theme: 'ember',
    color: '#dfaa7c',
    sigil: '☀',
    description: 'Sunlit citadels and a community with fire in its heart.',
    x: 69,
    y: 27,
  },
  {
    id: 'moonharbor',
    name: 'Moonharbor Court',
    streamer: '@LunarArchivist',
    theme: 'moon',
    color: '#b49bdd',
    sigil: '☾',
    description: 'A quiet harbor of midnight towers and untold stories.',
    x: 77,
    y: 73,
  },
  {
    id: 'stormgarden',
    name: 'Stormgarden Reach',
    streamer: '@MossAndThunder',
    theme: 'verdant',
    color: '#8cbaa2',
    sigil: '❖',
    description: 'Wild green borders, old promises and new beginnings.',
    x: 31,
    y: 77,
  },
];
export type AtlasRealm = RealmIdentity & {
  mode: Mode;
  synthetic: boolean;
  citizens: number;
  active: number;
  territories: number;
  discovered: number;
  maxOutposts: number;
  fortressHealth: number;
  season: number;
  challengeWins: number;
  currentBattle: boolean;
  kingdoms: {
    id: Faction;
    name: string;
    color: string;
    citizens: number;
    territories: number;
    lord: string | null;
  }[];
  latestEvent: string | null;
};
export type AtlasSnapshot = {
  mode: Mode;
  source: 'local-simulation' | 'local-live';
  now: number;
  currentRealm: string;
  realms: AtlasRealm[];
};
export function realmIdentity(id = 'home'): RealmIdentity {
  return REALMS.find((r) => r.id === id) ?? REALMS[0];
}
