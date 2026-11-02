import type {
  Character,
  Chapter,
  Election,
  Faction,
  Mode,
  Season,
  Territory,
  WorldEvent,
  Command,
} from './types';
import type { RealmChallenge } from './expansion';
export type ChapterProposal = {
  id: string;
  characterId: string;
  name: string;
  kingdom: Faction;
  territory: string;
  status: 'pending' | 'accepted' | 'dismissed';
  reason: string | null;
  createdAt: number;
  chapterId: string | null;
};
export type PublicCitizen = Pick<
  Character,
  'id' | 'name' | 'class' | 'level' | 'kingdom' | 'contribution' | 'supporter' | 'isLord'
>;
export type PersonalRecap = {
  battle: {
    id: string;
    outcome: 'won' | 'lost' | 'draw' | 'cancelled';
    summary: string;
    xp: number;
    gold: number;
    reward: string;
  } | null;
  upgrade: {
    definition: string;
    name: string;
    level: number;
    cost: number;
    shortfall: number;
  } | null;
};
export type CompanionState = {
  mode: Mode;
  realmId: string;
  realm: string;
  now: number;
  generation: string;
  preview: boolean;
  identity: { name: string; verified: boolean };
  role: 'visitor' | 'citizen' | 'lord';
  character: Character | null;
  personalRecap: PersonalRecap | null;
  kingdoms: {
    id: Faction;
    name: string;
    color: string;
    citizens: number;
    territories: number;
    lord: string | null;
    fortressHealth: number;
    points: number;
    wins: number;
  }[];
  territories: Territory[];
  chapter: Chapter | null;
  elections: Election[];
  challenges: RealmChallenge[];
  events: WorldEvent[];
  season: Season;
  citizens: PublicCitizen[];
  proposals: ChapterProposal[];
  connected: boolean;
  lordEndsAt: number | null;
};
export const PLAYER_COMMANDS: Command['type'][] = [
  'join',
  'class',
  'pledge',
  'vote',
  'equip',
  'upgrade',
  'buy',
  'nominate',
  'elect',
];
