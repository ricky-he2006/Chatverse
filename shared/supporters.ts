export type SupporterTier = 0 | 1 | 2 | 3;
export const SUPPORTER_RANKS = [
  {
    title: 'Citizen',
    label: 'Free citizen',
    color: '#a2b3c1',
    banner: 'The Common Hearth',
    appearance: 'Traveler’s colors',
  },
  {
    title: 'Knight',
    label: 'Tier 1',
    color: '#83cdbb',
    banner: 'The Verdant Oath',
    appearance: 'Jade-trimmed regalia',
  },
  {
    title: 'Baron',
    label: 'Tier 2',
    color: '#b8a0ee',
    banner: 'The Violet Court',
    appearance: 'Amethyst-trimmed regalia',
  },
  {
    title: 'Duke',
    label: 'Tier 3',
    color: '#edca83',
    banner: 'The Gilded Dawn',
    appearance: 'Gilded ceremonial regalia',
  },
] as const;
export type SupporterStatus = {
  tier: SupporterTier | null;
  title: string;
  source: 'simulation' | 'twitch' | 'unavailable';
  verifiedAt: number | null;
  gifted: boolean;
};
export function twitchTier(value: unknown): SupporterTier {
  if (value === '1000') return 1;
  if (value === '2000') return 2;
  if (value === '3000') return 3;
  throw new Error('Unsupported Twitch subscription tier');
}
